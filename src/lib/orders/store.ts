// Orders in the database (docs/DATAMODEL.md § Order, docs/STATE_MACHINES.md).
// Every status change goes through transitionOrder: compare-and-set on the
// status, a line in order_events and the side effects in the outbox, all in
// the caller's transaction (.claude/rules/database.md § Transacties).

import { createHash, randomBytes } from "node:crypto";
import { appendAudit } from "@/lib/admin/audit";
import { fromDbTime, selectRows, toDbTime, type Connection, type Queryable } from "@/lib/db";
import type { Locale } from "@/lib/i18n/config";
import type { CustomerDetails } from "./customer";
import { enqueue } from "./outbox";
import type { Snapshot } from "./snapshot";
import { blockedByHold, canTransition, CANCEL_WINDOW_MS, EFFECTS, insideCancelWindow, isOrderStatus, SNAPSHOT_VALID_MS, type Actor, type OrderStatus } from "./states";

/** A transition that is not in the table (docs/STATE_MACHINES.md): a bug in the caller, never silently skipped. */
export class TransitionError extends Error {}
/** Someone else changed the order between reading and writing: read again, do not carry on. */
export class ConcurrentChangeError extends Error {}

type OrderRow = {
  id: number | string;
  reference: string;
  status: string;
  hold_reason: string | null;
  request_hash: string;
  cancel_window_ends_at: string | null;
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function insertOrder(
  conn: Connection,
  o: { reference: string; checkoutAttemptId: string; requestHash: string; locale: Locale; customer: CustomerDetails; snapshot: Snapshot; now: Date },
): Promise<number> {
  const c = o.customer;
  const s = o.snapshot;
  const [result] = await conn.query(
    `INSERT INTO orders (reference, checkout_attempt_id, request_hash, status, locale, currency,
       email, phone, first_name, last_name, street, house_number, postcode, city, country,
       subtotal_cents, shipping_standard_cents, shipping_large_cents, total_cents, snapshot_expires_at, created_at)
     VALUES (?, ?, ?, 'PENDING_PAYMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      o.reference, o.checkoutAttemptId, o.requestHash, o.locale, s.currency,
      c.email, c.phone, c.firstName, c.lastName, c.street, c.houseNumber, c.postcode, c.city, c.country,
      s.subtotal.amount, s.shippingStandard.amount, s.shippingLarge.amount, s.total.amount,
      toDbTime(new Date(o.now.getTime() + SNAPSHOT_VALID_MS)), toDbTime(o.now),
    ],
  );
  const id = Number((result as { insertId: number }).insertId);
  for (const l of s.lines) {
    await conn.query(
      `INSERT INTO order_lines (order_id, line_no, source, product_id, offer_id, name, brand, sku, quantity,
         unit_price_cents, line_total_cents, vat_rate_bp, large_shipping_cents, supplier_cost_cents, supplier_cost_currency,
         min_days, max_days, ships_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, l.lineNo, l.source, l.productId, l.offerId, l.name, l.brand, l.sku, l.quantity,
        l.unitPrice.amount, l.lineTotal.amount, l.vatRateBasisPoints, l.largeShipping?.amount ?? null,
        l.supplierCost.amount, l.supplierCost.currency, l.minDays, l.maxDays, l.shipsFrom,
      ],
    );
  }
  await conn.query("INSERT INTO order_events (order_id, from_status, to_status, actor, at) VALUES (?, NULL, 'PENDING_PAYMENT', 'customer', ?)", [id, toDbTime(o.now)]);
  return id;
}

export async function findByCheckoutAttempt(db: Queryable, checkoutAttemptId: string): Promise<{ id: number; reference: string; requestHash: string } | null> {
  const [row] = await selectRows<OrderRow>(db, "SELECT id, reference, request_hash FROM orders WHERE checkout_attempt_id = ?", [checkoutAttemptId]);
  return row ? { id: Number(row.id), reference: row.reference, requestHash: row.request_hash } : null;
}

/**
 * A new key for the status link. The token goes to the customer once (in the
 * link); only its hash is stored, so a copy of the database opens nothing.
 * Every message gets its own key, all valid.
 */
export async function issueAccessToken(conn: Connection, orderId: number, now: Date): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await conn.query("INSERT INTO order_access_tokens (token_hash, order_id, created_at) VALUES (?, ?, ?)", [hashToken(token), orderId, toDbTime(now)]);
  return token;
}

/** The order a status link opens; null for an unknown or malformed key (one answer for both). */
export async function findOrderIdByToken(db: Queryable, token: string): Promise<number | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await selectRows<{ order_id: number | string }>(db, "SELECT order_id FROM order_access_tokens WHERE token_hash = ?", [hashToken(token)]);
  return row ? Number(row.order_id) : null;
}

/** Timestamps set when an order enters a status. */
function enterColumns(to: OrderStatus, now: Date): { sql: string; params: unknown[] } {
  if (to === "PAID") return { sql: ", paid_at = ?, cancel_window_ends_at = ?", params: [toDbTime(now), toDbTime(new Date(now.getTime() + CANCEL_WINDOW_MS))] };
  if (to === "CANCELLED") return { sql: ", cancelled_at = ?", params: [toDbTime(now)] };
  if (to === "COMPLETED") return { sql: ", completed_at = ?", params: [toDbTime(now)] };
  return { sql: "", params: [] };
}

/**
 * Moves an order to `to`, inside the caller's transaction. Already there: a
 * no-op (a retried webhook or job). Not allowed, or held: TransitionError,
 * with nothing written. Changed by someone else meanwhile: ConcurrentChangeError.
 */
export async function transitionOrder(
  conn: Connection,
  t: { orderId: number; to: OrderStatus; actor: Actor; reason?: string; now: Date },
): Promise<{ changed: boolean; from: OrderStatus }> {
  const [row] = await selectRows<OrderRow>(conn, "SELECT id, reference, status, hold_reason FROM orders WHERE id = ?", [t.orderId]);
  if (!row || !isOrderStatus(row.status)) throw new TransitionError(`order ${t.orderId} not found`);
  const from = row.status;
  if (from === t.to) return { changed: false, from };
  if (!canTransition(from, t.to, t.actor)) throw new TransitionError(`${from} → ${t.to} by ${t.actor} is not a transition`);
  if (blockedByHold(from, row.hold_reason)) throw new TransitionError(`order ${t.orderId} is on hold (${row.hold_reason})`);

  const extra = enterColumns(t.to, t.now);
  // The hold is part of the compare: a hold set between our read and this write stops the change.
  const [result] = await conn.query(`UPDATE orders SET status = ?${extra.sql} WHERE id = ? AND status = ? AND hold_reason <=> ?`, [
    t.to, ...extra.params, t.orderId, from, row.hold_reason,
  ]);
  if ((result as { affectedRows: number }).affectedRows !== 1) throw new ConcurrentChangeError(`order ${t.orderId} changed during ${from} → ${t.to}`);

  await conn.query("INSERT INTO order_events (order_id, from_status, to_status, actor, reason, at) VALUES (?, ?, ?, ?, ?, ?)", [
    t.orderId, from, t.to, t.actor, t.reason?.slice(0, 200) ?? null, toDbTime(t.now),
  ]);
  for (const kind of EFFECTS[t.to] ?? []) {
    await enqueue(conn, kind, `order:${t.orderId}`, { orderId: t.orderId, reference: row.reference }, t.now);
  }
  return { changed: true, from };
}

/**
 * The customer changes name, address, phone or e-mail inside the cancel window
 * (D-04). Products and quantities cannot change: that changes the amount.
 * The window is checked by the database in the same statement, so a change
 * one millisecond after the window is refused even under load.
 */
export async function changeCustomerDetails(
  conn: Connection,
  c: { orderId: number; customer: CustomerDetails; now: Date },
): Promise<{ ok: true; changed: string[] } | { ok: false; reason: "window-closed" }> {
  const [row] = await selectRows<OrderRow & Record<string, string>>(
    conn,
    "SELECT status, hold_reason, cancel_window_ends_at, email, phone, first_name, last_name, street, house_number, postcode, city, country FROM orders WHERE id = ? FOR UPDATE",
    [c.orderId],
  );
  if (!row || !isOrderStatus(row.status)) return { ok: false, reason: "window-closed" };
  const windowEnds = row.cancel_window_ends_at ? fromDbTime(row.cancel_window_ends_at) : null;
  if (!insideCancelWindow(row.status, row.hold_reason, windowEnds, c.now)) return { ok: false, reason: "window-closed" };

  const next: Record<string, string> = {
    email: c.customer.email, phone: c.customer.phone, first_name: c.customer.firstName, last_name: c.customer.lastName,
    street: c.customer.street, house_number: c.customer.houseNumber, postcode: c.customer.postcode, city: c.customer.city, country: c.customer.country,
  };
  const changed = Object.keys(next).filter((k) => row[k] !== next[k]);
  if (!changed.length) return { ok: true, changed };
  const [result] = await conn.query(
    `UPDATE orders SET ${changed.map((k) => `${k} = ?`).join(", ")} WHERE id = ? AND status = 'PAID' AND hold_reason IS NULL AND cancel_window_ends_at > ?`,
    [...changed.map((k) => next[k]), c.orderId, toDbTime(c.now)],
  );
  if ((result as { affectedRows: number }).affectedRows !== 1) return { ok: false, reason: "window-closed" };
  // Which fields, not their values (.claude/rules/beveiliging.md § Auditlog: no full personal data).
  await appendAudit(conn, { actor: "customer", action: "order.details-changed", objectType: "order", objectId: c.orderId, after: { fields: changed } }, c.now);
  return { ok: true, changed };
}

/** Paid orders whose cancel window has closed, without a hold: ready for purchasing (D-04). */
export async function ordersWithClosedWindow(db: Queryable, now: Date, limit = 50): Promise<number[]> {
  const rows = await selectRows<{ id: number | string }>(
    db,
    "SELECT id FROM orders WHERE status = 'PAID' AND hold_reason IS NULL AND cancel_window_ends_at <= ? ORDER BY id LIMIT ?",
    [toDbTime(now), limit],
  );
  return rows.map((r) => Number(r.id));
}
