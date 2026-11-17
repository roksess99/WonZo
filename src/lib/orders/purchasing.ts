// Purchasing at the supplier, automatically (D-04): after the 30-minute
// window an order is FULFILLMENT_PENDING and its "supplier-order" effect is
// in the outbox. Here that becomes a purchase order (DRAFT), is checked at the
// supplier (price at most 10 % above the frozen one), recorded as SUBMITTING
// and committed, and only then sent — intent first (docs/PAYMENTS.md). No
// answer: UNKNOWN, and the supplier is asked by our own reference, never sent
// again blindly (docs/IDEMPOTENCY.md). A refusal (most likely too little
// balance): an alert at once, and again every 30 minutes for 24 hours with the
// same reference; then the owner chooses (D-04). Server-side only.

import { randomUUID } from "node:crypto";
import { appendAudit } from "@/lib/admin/audit";
import type { SupplierOrdering, SupplierOrderRequest } from "@/lib/catalog/ordering";
import { fromDbTime, getPool, selectRows, toDbTime, withTransaction, type Connection, type Queryable } from "@/lib/db";
import { money, type Money } from "@/lib/money";
import { enqueue } from "./outbox";
import { canTransitionSupplierOrder, isSupplierOrderStatus, priceAcceptable, RETRY_EVERY_MS, RETRY_FOR_MS, type SupplierActor, type SupplierOrderStatus } from "./supplier-states";
import { lockOrder, transitionOrder } from "./store";

export class SupplierTransitionError extends Error {}

export type SupplierOrderRow = {
  id: string;
  orderId: number;
  source: string;
  reference: string;
  status: SupplierOrderStatus;
  supplierOrderRef: string | null;
  expectedCost: Money;
  checkedProducts: Money | null;
  checkedTotal: Money | null;
  blockedReason: string | null;
  priceAccepted: Money | null;
  priceAcceptedBy: string | null;
  attempts: number;
  firstFailedAt: Date | null;
  lastError: string | null;
  nextAttemptAt: Date;
  gaveUpAt: Date | null;
  placedAt: Date | null;
  createdAt: Date;
};

const COLUMNS = `id, order_id, source, reference, status, supplier_order_ref, expected_cost_cents, checked_products_cents, checked_total_cents,
  blocked_reason, price_accepted_cents, price_accepted_by, attempts, first_failed_at, last_error, next_attempt_at, gave_up_at, placed_at, created_at`;
type Raw = Record<string, string | number | null>;
const cents = (x: string | number | null) => (x === null ? null : money(Number(x)));
const time = (x: string | number | null) => (x === null ? null : fromDbTime(String(x)));

function toRow(r: Raw): SupplierOrderRow {
  const status = String(r.status);
  if (!isSupplierOrderStatus(status)) throw new Error(`supplier order ${String(r.id)}: unknown status ${status}`);
  return {
    id: String(r.id),
    orderId: Number(r.order_id),
    source: String(r.source),
    reference: String(r.reference),
    status,
    supplierOrderRef: r.supplier_order_ref === null ? null : String(r.supplier_order_ref),
    expectedCost: money(Number(r.expected_cost_cents)),
    checkedProducts: cents(r.checked_products_cents),
    checkedTotal: cents(r.checked_total_cents),
    blockedReason: r.blocked_reason === null ? null : String(r.blocked_reason),
    priceAccepted: cents(r.price_accepted_cents),
    priceAcceptedBy: r.price_accepted_by === null ? null : String(r.price_accepted_by),
    attempts: Number(r.attempts),
    firstFailedAt: time(r.first_failed_at),
    lastError: r.last_error === null ? null : String(r.last_error),
    nextAttemptAt: fromDbTime(String(r.next_attempt_at)),
    gaveUpAt: time(r.gave_up_at),
    placedAt: time(r.placed_at),
    createdAt: fromDbTime(String(r.created_at)),
  };
}

export async function supplierOrdersOf(db: Queryable, orderId: number, forUpdate = false): Promise<SupplierOrderRow[]> {
  return (await selectRows<Raw>(db, `SELECT ${COLUMNS} FROM supplier_orders WHERE order_id = ? ORDER BY created_at, id${forUpdate ? " FOR UPDATE" : ""}`, [orderId])).map(toRow);
}

async function supplierOrderById(db: Queryable, id: string, forUpdate = false): Promise<SupplierOrderRow | null> {
  const [r] = await selectRows<Raw>(db, `SELECT ${COLUMNS} FROM supplier_orders WHERE id = ?${forUpdate ? " FOR UPDATE" : ""}`, [id]);
  return r ? toRow(r) : null;
}

/** Compare-and-set, with an event line, in the caller's transaction. Already there: a no-op. */
export async function transitionSupplierOrder(
  conn: Connection,
  t: { id: string; to: SupplierOrderStatus; actor: SupplierActor; reason?: string; now: Date; set?: Record<string, string | number | null> },
): Promise<boolean> {
  const current = await supplierOrderById(conn, t.id);
  if (!current) throw new SupplierTransitionError(`supplier order ${t.id} not found`);
  if (current.status === t.to) return false;
  if (!canTransitionSupplierOrder(current.status, t.to, t.actor)) throw new SupplierTransitionError(`${current.status} → ${t.to} by ${t.actor} is not a transition`);
  const set = Object.entries(t.set ?? {});
  const [result] = await conn.query(`UPDATE supplier_orders SET status = ?${set.map(([k]) => `, ${k} = ?`).join("")} WHERE id = ? AND status = ?`, [
    t.to,
    ...set.map(([, v]) => v),
    t.id,
    current.status,
  ]);
  if ((result as { affectedRows: number }).affectedRows !== 1) throw new SupplierTransitionError(`supplier order ${t.id} changed during ${current.status} → ${t.to}`);
  await conn.query("INSERT INTO supplier_order_events (supplier_order_id, from_status, to_status, actor, reason, at) VALUES (?, ?, ?, ?, ?, ?)", [
    t.id, current.status, t.to, t.actor, t.reason?.slice(0, 300) ?? null, toDbTime(t.now),
  ]);
  return true;
}

/** The own reference at the supplier: the order number the owner also sees ("WZ-2026-00001"). */
export function supplierReference(orderReference: string, source: string): string {
  return source === "bigbuy" ? orderReference : `${orderReference}-${source}`.slice(0, 40);
}

// ------------------------------------------------------------- drafts

/**
 * Turns the "supplier-order" effects in the outbox into purchase orders:
 * one per order and source, from the frozen lines. Safe to run twice (unique
 * per order and source). An order that is no longer FULFILLMENT_PENDING
 * (cancelled meanwhile) gets none.
 */
export async function createDrafts(now: Date, limit = 100): Promise<number> {
  const due = await selectRows<{ id: number | string; payload: unknown }>(
    getPool(),
    "SELECT id, payload FROM outbox WHERE kind = 'supplier-order' AND status = 'PENDING' AND next_attempt_at <= ? ORDER BY id LIMIT ?",
    [toDbTime(now), limit],
  );
  let created = 0;
  for (const item of due) {
    const payload = typeof item.payload === "string" ? (JSON.parse(item.payload) as unknown) : item.payload;
    const orderId = Number((payload as { orderId?: unknown } | null)?.orderId);
    created += await withTransaction(async (conn) => {
      let n = 0;
      const order = Number.isSafeInteger(orderId) ? await lockOrder(conn, orderId) : null;
      if (order?.status === "FULFILLMENT_PENDING") {
        const sources = await selectRows<{ source: string; cost: number | string }>(
          conn,
          "SELECT source, SUM(supplier_cost_cents * quantity) AS cost FROM order_lines WHERE order_id = ? GROUP BY source ORDER BY source",
          [orderId],
        );
        for (const s of sources) {
          const id = randomUUID();
          const [r] = await conn.query(
            `INSERT INTO supplier_orders (id, order_id, source, reference, status, expected_cost_cents, next_attempt_at, created_at)
             VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?) ON DUPLICATE KEY UPDATE id = id`,
            [id, orderId, s.source, supplierReference(order.reference, s.source), Number(s.cost), toDbTime(now), toDbTime(now)],
          );
          if ((r as { affectedRows: number }).affectedRows === 1) {
            await conn.query("INSERT INTO supplier_order_events (supplier_order_id, from_status, to_status, actor, reason, at) VALUES (?, NULL, 'DRAFT', 'system', ?, ?)", [
              id, "bestelling vrijgegeven voor inkoop", toDbTime(now),
            ]);
            n++;
          }
        }
      }
      await conn.query("UPDATE outbox SET status = 'DONE', sent_at = ? WHERE id = ? AND status = 'PENDING'", [toDbTime(now), item.id]);
      return n;
    });
  }
  return created;
}

// ------------------------------------------------------------- placing

async function requestFor(db: Queryable, so: SupplierOrderRow): Promise<SupplierOrderRequest> {
  const [o] = await selectRows<Raw>(db, "SELECT locale, first_name, last_name, street, house_number, postcode, city, country, phone, email FROM orders WHERE id = ?", [so.orderId]);
  if (!o) throw new Error(`order ${so.orderId} not found`);
  const lines = await selectRows<{ sku: string; quantity: number | string }>(db, "SELECT sku, quantity FROM order_lines WHERE order_id = ? AND source = ? ORDER BY line_no", [so.orderId, so.source]);
  const s = (k: string) => String(o[k] ?? "");
  return {
    reference: so.reference,
    lines: lines.map((l) => ({ sku: l.sku, quantity: Number(l.quantity) })),
    address: { firstName: s("first_name"), lastName: s("last_name"), street: s("street"), houseNumber: s("house_number"), postcode: s("postcode"), city: s("city"), country: s("country"), phone: s("phone"), email: s("email") },
    language: o.locale === "en" ? "en" : "nl",
  };
}

/** Every purchase order of the order is at the supplier: the order is PURCHASED. */
async function markOrderPurchasedIfDone(conn: Connection, orderId: number, now: Date): Promise<void> {
  const order = await lockOrder(conn, orderId);
  const all = await supplierOrdersOf(conn, orderId);
  if (order?.status === "FULFILLMENT_PENDING" && all.length > 0 && all.every((s) => s.status === "PLACED")) {
    await transitionOrder(conn, { orderId, to: "PURCHASED", actor: "system", reason: "ingekocht bij de leverancier", now });
  }
}

/**
 * A try that did not work. The first one alerts the owner at once (D-04);
 * after 24 hours of trying the code stops and the owner chooses.
 */
async function recordFailure(conn: Connection, so: SupplierOrderRow, error: string, now: Date): Promise<void> {
  const first = so.firstFailedAt ?? now;
  const gaveUp = now.getTime() - first.getTime() >= RETRY_FOR_MS;
  await conn.query("UPDATE supplier_orders SET first_failed_at = ?, last_error = ?, next_attempt_at = ?, gave_up_at = ? WHERE id = ?", [
    toDbTime(first), error.slice(0, 300), toDbTime(new Date(now.getTime() + RETRY_EVERY_MS)), gaveUp ? toDbTime(now) : null, so.id,
  ]);
  if (!so.firstFailedAt) await enqueue(conn, "admin-alert", `supplier:${so.id}:failed`, { orderId: so.orderId, supplierOrderId: so.id, error: error.slice(0, 200) }, now);
  if (gaveUp) await enqueue(conn, "admin-alert", `supplier:${so.id}:gave-up`, { orderId: so.orderId, supplierOrderId: so.id }, now);
}

export type PurchaseOutcome = "placed" | "unknown" | "refused" | "blocked" | "waiting" | "skipped";

/** One try for a DRAFT or REJECTED purchase order: check, record the intent, send. */
async function attempt(ordering: SupplierOrdering, so: SupplierOrderRow, now: Date): Promise<PurchaseOutcome> {
  const request = await requestFor(getPool(), so);
  const check = await ordering.check(request);
  if (check.kind === "unknown") {
    await getPool().query("UPDATE supplier_orders SET next_attempt_at = ? WHERE id = ?", [toDbTime(new Date(now.getTime() + 5 * 60_000)), so.id]);
    return "waiting";
  }
  if (check.kind === "refused") {
    await withTransaction((conn) => recordFailure(conn, so, `controle geweigerd (HTTP ${check.status}) ${check.message}`.trim(), now));
    return "refused";
  }
  const accepted = so.priceAccepted !== null && check.products.amount <= so.priceAccepted.amount;
  if (!priceAcceptable(so.expectedCost.amount, check.products.amount) && !accepted) {
    await withTransaction(async (conn) => {
      await conn.query("UPDATE supplier_orders SET blocked_reason = 'PRICE_INCREASE', checked_products_cents = ?, checked_total_cents = ? WHERE id = ?", [check.products.amount, check.total.amount, so.id]);
      await enqueue(conn, "admin-alert", `supplier:${so.id}:price:${check.products.amount}`, { orderId: so.orderId, supplierOrderId: so.id, expectedCents: so.expectedCost.amount, checkedCents: check.products.amount }, now);
    });
    return "blocked";
  }

  // The intent, committed before the call; under the order's lock, so a cancel by the admin and this never cross.
  const go = await withTransaction(async (conn) => {
    const order = await lockOrder(conn, so.orderId);
    if (order?.status !== "FULFILLMENT_PENDING") return false;
    return transitionSupplierOrder(conn, {
      id: so.id, to: "SUBMITTING", actor: "system", reason: so.status === "REJECTED" ? "opnieuw geprobeerd (D-04)" : undefined, now,
      set: { attempts: so.attempts + 1, checked_products_cents: check.products.amount, checked_total_cents: check.total.amount },
    });
  });
  if (!go) return "skipped";

  const placed = await ordering.place(request);
  await withTransaction(async (conn) => {
    // Always the order's row first, then the purchase order: the same order as a cancel, so the two never deadlock.
    await lockOrder(conn, so.orderId);
    if (placed.kind === "placed") {
      await transitionSupplierOrder(conn, { id: so.id, to: "PLACED", actor: "system", now, set: { supplier_order_ref: placed.supplierOrderRef.slice(0, 40), placed_at: toDbTime(now), last_error: null, gave_up_at: null } });
      await markOrderPurchasedIfDone(conn, so.orderId, now);
    } else if (placed.kind === "refused") {
      const reason = `geweigerd (HTTP ${placed.status}) ${placed.message}`.trim();
      await transitionSupplierOrder(conn, { id: so.id, to: "REJECTED", actor: "system", reason, now });
      await recordFailure(conn, so, reason, now);
    } else {
      await transitionSupplierOrder(conn, { id: so.id, to: "UNKNOWN", actor: "system", reason: "geen uitsluitsel van de leverancier", now, set: { next_attempt_at: toDbTime(new Date(now.getTime() + 2 * 60_000)) } });
    }
  });
  return placed.kind;
}

/** UNKNOWN: ask the supplier by our reference. Found: PLACED. Absent (a 404, proof): REJECTED, and tried again. */
async function settleUnknown(ordering: SupplierOrdering, so: SupplierOrderRow, now: Date): Promise<PurchaseOutcome> {
  const found = await ordering.lookup(so.reference);
  if (found.kind === "unknown") {
    await withTransaction(async (conn) => {
      await conn.query("UPDATE supplier_orders SET next_attempt_at = ? WHERE id = ?", [toDbTime(new Date(now.getTime() + 5 * 60_000)), so.id]);
      // Still unknown after an hour: a person should look (docs/BEHEER.md: "status opvragen", never "order again").
      const [since] = await selectRows<{ at: string | null }>(conn, "SELECT MAX(at) AS at FROM supplier_order_events WHERE supplier_order_id = ? AND to_status = 'UNKNOWN'", [so.id]);
      if (since?.at && now.getTime() - fromDbTime(since.at).getTime() > 60 * 60_000) await enqueue(conn, "admin-alert", `supplier:${so.id}:unknown`, { orderId: so.orderId, supplierOrderId: so.id }, now);
    });
    return "unknown";
  }
  await withTransaction(async (conn) => {
    await lockOrder(conn, so.orderId);
    if (found.kind === "found") {
      await transitionSupplierOrder(conn, { id: so.id, to: "PLACED", actor: "reconciliation", reason: "gevonden op de eigen referentie", now, set: { supplier_order_ref: found.supplierOrderRef.slice(0, 40), placed_at: toDbTime(now) } });
      await markOrderPurchasedIfDone(conn, so.orderId, now);
    } else {
      await transitionSupplierOrder(conn, { id: so.id, to: "REJECTED", actor: "reconciliation", reason: "niet aangekomen bij de leverancier (404 op de eigen referentie)", now, set: { next_attempt_at: toDbTime(now) } });
    }
  });
  return found.kind === "found" ? "placed" : "refused";
}

/**
 * The purchasing round of the orders job: drafts from the outbox, then every
 * purchase order that is due. Without ordering (SUPPLIER_ORDERING off) only
 * the drafts: the panel shows them as waiting.
 */
export async function runPurchasing(ordering: SupplierOrdering | null, now: Date = new Date(), limit = 50): Promise<{ drafts: number; outcomes: PurchaseOutcome[] }> {
  const drafts = await createDrafts(now);
  if (!ordering) return { drafts, outcomes: [] };
  const due = (
    await selectRows<Raw>(
      getPool(),
      `SELECT ${COLUMNS} FROM supplier_orders
        WHERE next_attempt_at <= ? AND source = ? AND blocked_reason IS NULL AND gave_up_at IS NULL AND status IN ('DRAFT', 'REJECTED', 'UNKNOWN')
        ORDER BY next_attempt_at, id LIMIT ?`,
      [toDbTime(now), ordering.source, limit],
    )
  ).map(toRow);
  const outcomes: PurchaseOutcome[] = [];
  for (const so of due) outcomes.push(so.status === "UNKNOWN" ? await settleUnknown(ordering, so, now) : await attempt(ordering, so, now));
  return { drafts, outcomes };
}

// ------------------------------------------------------- the owner's choices

/** A price more than 10 % higher (D-04): the owner lets it be ordered anyway, up to the price that was checked. */
export async function acceptPrice(conn: Connection, input: { supplierOrderId: string; expectedCheckedCents: number; actor: string; reason: string; now: Date }): Promise<"ok" | "changed"> {
  const so = await supplierOrderById(conn, input.supplierOrderId, true);
  if (!so || so.blockedReason !== "PRICE_INCREASE" || so.checkedProducts?.amount !== input.expectedCheckedCents) return "changed";
  await conn.query("UPDATE supplier_orders SET blocked_reason = NULL, price_accepted_cents = ?, price_accepted_by = ?, next_attempt_at = ? WHERE id = ?", [
    so.checkedProducts.amount, input.actor.slice(0, 60), toDbTime(input.now), so.id,
  ]);
  await appendAudit(conn, { actor: input.actor, action: "purchase.price-accepted", objectType: "order", objectId: so.orderId, before: { expectedCents: so.expectedCost.amount }, after: { acceptedCents: so.checkedProducts.amount }, reason: input.reason }, input.now);
  return "ok";
}

/** After 24 hours of refusals (D-04): the owner chooses to try again — once more for 24 hours. */
export async function retryPurchase(conn: Connection, input: { supplierOrderId: string; actor: string; reason: string; now: Date }): Promise<"ok" | "changed"> {
  const so = await supplierOrderById(conn, input.supplierOrderId, true);
  if (!so || !so.gaveUpAt || (so.status !== "REJECTED" && so.status !== "DRAFT")) return "changed";
  await conn.query("UPDATE supplier_orders SET gave_up_at = NULL, first_failed_at = NULL, next_attempt_at = ? WHERE id = ?", [toDbTime(input.now), so.id]);
  await appendAudit(conn, { actor: input.actor, action: "purchase.retry", objectType: "order", objectId: so.orderId, before: { lastError: so.lastError }, reason: input.reason }, input.now);
  return "ok";
}

/** Cancelling the order: purchase orders that never reached the supplier are cancelled with it. Caller holds the order lock. */
export async function cancelOpenPurchases(conn: Connection, orderId: number, reason: string, now: Date): Promise<void> {
  for (const so of await supplierOrdersOf(conn, orderId, true)) {
    if (so.status === "DRAFT" || so.status === "REJECTED") await transitionSupplierOrder(conn, { id: so.id, to: "CANCELLED", actor: "admin", reason, now });
  }
}
