// Returns (D-09, docs/RETOUREN.md, docs/STATE_MACHINES.md § Return). The
// customer asks with the e-mail address of the order and the invoice number
// (owner 2026-10-13), picks pieces and a reason per line; the amount is
// computed here from the frozen lines (./amount.ts) and stored with the
// request. One open return per order: a unique key on `open_order_id`, not a
// check in code. The admin marks it received, then approves — paying back all
// or part (with a reason) — or refuses with a reason (owner 2026-10-12/13).
// The refund goes intent first (docs/PAYMENTS.md); the return is REFUNDED
// only once the provider says the money went back, and then gets its credit
// note. Every change locks the order's row first, like every other money
// action on an order. Server-side only.

import { appendAudit } from "@/lib/admin/audit";
import { cleanReason } from "@/lib/admin/order-actions";
import { fromDbTime, getPool, isDuplicateKey, selectRows, toDbTime, withTransaction, type Connection, type Queryable } from "@/lib/db";
import { amsterdamYear, nextNumber } from "@/lib/db/counters";
import type { Locale } from "@/lib/i18n/config";
import { money, type Money } from "@/lib/money";
import { enqueue } from "@/lib/orders/outbox";
import { lockOrder } from "@/lib/orders/store";
import { requestPaymentRefund, submitRefund } from "@/lib/payments";
import { defaultProvider, type PaymentProvider } from "@/lib/payments/mollie";
import { paymentsOfOrder, refundable } from "@/lib/payments/store";
import { isReturnReason, quoteReturn, withdrawalEndsAt, type ReturnableOrder, type ReturnReason, type ReturnRequestLine } from "./amount";
import { canTransitionReturn, isReturnStatus, RETURN_CLOSED, RETURNABLE_ORDER_STATUSES, type ReturnActor, type ReturnStatus } from "./states";

export class ReturnTransitionError extends Error {}

/** "R2026-00001": per year from the counter, in the same transaction as the return. */
export const returnNumber = (year: number, n: number) => `R${year}-${String(n).padStart(5, "0")}`;

/** What the customer typed, normalised; null when it cannot be an invoice number or an address. */
export function parseReturnKey(input: { email?: unknown; invoice?: unknown }): { email: string; invoice: string } | null {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const invoice = typeof input.invoice === "string" ? input.invoice.trim().toUpperCase() : "";
  if (!/^\d{4}-\d{5}$/.test(invoice) || email.length > 254 || !/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) return null;
  return { email, invoice };
}

/** The order of an invoice, only when the address matches too — one answer for every miss (docs/RETOUREN.md § Controleren). */
async function orderOfInvoice(db: Queryable, key: { email: string; invoice: string }): Promise<number | null> {
  const [row] = await selectRows<{ id: number | string }>(
    db,
    "SELECT o.id FROM invoices i JOIN orders o ON o.id = i.order_id WHERE i.number = ? AND i.kind = 'invoice' AND LOWER(o.email) = ?",
    [key.invoice, key.email],
  );
  return row ? Number(row.id) : null;
}

export type ReturnFormLine = { lineNo: number; name: string; sku: string; bought: number; returned: number; unitPrice: Money; largeShipping: Money | null };

/** What the return form shows and computes with: the customer's own order, no address. */
export type ReturnForm = {
  reference: string;
  invoice: string;
  lines: ReturnFormLine[];
  order: ReturnableOrder;
  withdrawalEndsAt: Date | null;
};

async function returnableOrder(db: Queryable, orderId: number): Promise<{ order: ReturnableOrder; lines: ReturnFormLine[]; reference: string } | null> {
  const [o] = await selectRows<{ reference: string; shipping_standard_cents: number | string; delivered_at: string | null; currency: string }>(
    db,
    "SELECT reference, shipping_standard_cents, delivered_at, currency FROM orders WHERE id = ?",
    [orderId],
  );
  if (!o || o.currency !== "EUR") return null;
  const closed = RETURN_CLOSED.filter((s) => s !== "REFUNDED");
  const marks = closed.map(() => "?").join(", ");
  const rows = await selectRows<{ line_no: number | string; name: string; sku: string; quantity: number | string; unit_price_cents: number | string; large_shipping_cents: number | string | null; returned: number | string }>(
    db,
    `SELECT l.line_no, l.name, l.sku, l.quantity, l.unit_price_cents, l.large_shipping_cents,
            (SELECT COALESCE(SUM(rl.quantity), 0) FROM return_lines rl JOIN returns r ON r.id = rl.return_id
              WHERE r.order_id = l.order_id AND rl.line_no = l.line_no AND r.status NOT IN (${marks})) AS returned
       FROM order_lines l WHERE l.order_id = ? ORDER BY l.line_no`,
    [...closed, orderId],
  );
  const [earlier] = await selectRows<{ s: number | string | null }>(db, `SELECT SUM(shipping_cents) AS s FROM returns WHERE order_id = ? AND status NOT IN (${marks})`, [orderId, ...closed]);
  const lines: ReturnFormLine[] = rows.map((r) => ({
    lineNo: Number(r.line_no),
    name: r.name,
    sku: r.sku,
    bought: Number(r.quantity),
    returned: Number(r.returned),
    unitPrice: money(Number(r.unit_price_cents)),
    largeShipping: r.large_shipping_cents === null ? null : money(Number(r.large_shipping_cents)),
  }));
  return {
    reference: o.reference,
    lines,
    order: {
      lines: lines.map((l) => ({ lineNo: l.lineNo, bought: l.bought, returned: l.returned, unitPrice: l.unitPrice, largeShipping: l.largeShipping })),
      shippingStandard: money(Number(o.shipping_standard_cents)),
      earlierShipping: money(Number(earlier?.s ?? 0)),
      deliveredAt: o.delivered_at ? fromDbTime(o.delivered_at) : null,
    },
  };
}

export type NotReturnable = "status" | "open-return" | "hold" | "nothing-left";

/** Whether this order can get a return now; the same checks again under the lock when it is asked. */
async function whyNot(db: Queryable, orderId: number, form: { order: ReturnableOrder }): Promise<NotReturnable | null> {
  const [o] = await selectRows<{ status: string; hold_reason: string | null }>(db, "SELECT status, hold_reason FROM orders WHERE id = ?", [orderId]);
  if (!o || !(RETURNABLE_ORDER_STATUSES as readonly string[]).includes(o.status)) return "status";
  if (o.hold_reason) return "hold";
  const [open] = await selectRows<{ id: number | string }>(db, "SELECT id FROM returns WHERE open_order_id = ?", [orderId]);
  if (open) return "open-return";
  if (form.order.lines.every((l) => l.returned >= l.bought)) return "nothing-left";
  return null;
}

export type LookupResult = { kind: "found"; form: ReturnForm } | { kind: "not-returnable"; why: NotReturnable } | { kind: "not-found" };

/** Step one of the form: the address and the invoice number. A miss of either gives the same answer. */
export async function lookupReturn(input: { email?: unknown; invoice?: unknown }, db: Queryable = getPool()): Promise<LookupResult> {
  const key = parseReturnKey(input);
  const orderId = key ? await orderOfInvoice(db, key) : null;
  if (!key || !orderId) return { kind: "not-found" };
  const r = await returnableOrder(db, orderId);
  if (!r) return { kind: "not-found" };
  const why = await whyNot(db, orderId, r);
  if (why) return { kind: "not-returnable", why };
  return { kind: "found", form: { reference: r.reference, invoice: key.invoice, lines: r.lines, order: r.order, withdrawalEndsAt: withdrawalEndsAt(r.order.deliveredAt) } };
}

export type RequestResult =
  | { kind: "requested"; number: string; total: Money; locale: Locale }
  | { kind: "not-found" }
  | { kind: "not-returnable"; why: NotReturnable }
  | { kind: "invalid"; error: "empty" | "lines" | "note"; lines?: Record<number, string> };

/** Lines from the browser: only line number, pieces and reason are taken — never an amount (.claude/rules/geld.md). */
export function parseReturnLines(x: unknown): ReturnRequestLine[] | null {
  if (!Array.isArray(x) || x.length > 50) return null;
  const out: ReturnRequestLine[] = [];
  for (const l of x) {
    if (typeof l !== "object" || l === null) return null;
    const { lineNo, quantity, reason } = l as Record<string, unknown>;
    if (!Number.isSafeInteger(lineNo) || !Number.isSafeInteger(quantity)) return null;
    out.push({ lineNo: lineNo as number, quantity: quantity as number, reason: (isReturnReason(reason) ? reason : "invalid") as ReturnReason });
  }
  return out;
}

/** Step two: the customer sends the pieces and reasons. Checked again in full, under the order's lock. */
export async function requestReturn(input: { email?: unknown; invoice?: unknown; lines?: unknown; note?: unknown }, now: Date = new Date()): Promise<RequestResult> {
  const key = parseReturnKey(input);
  const lines = parseReturnLines(input.lines);
  const note = typeof input.note === "string" ? input.note.trim().replace(/\s+/g, " ") : "";
  if (!key) return { kind: "not-found" };
  if (!lines) return { kind: "invalid", error: "lines" };
  if (note.length > 500) return { kind: "invalid", error: "note" };
  const orderId = await orderOfInvoice(getPool(), key);
  if (!orderId) return { kind: "not-found" };

  const result = await withTransaction(async (conn): Promise<RequestResult & { returnId?: number }> => {
    const order = await lockOrder(conn, orderId);
    if (!order) return { kind: "not-found" };
    const r = await returnableOrder(conn, orderId);
    if (!r) return { kind: "not-found" };
    const why = await whyNot(conn, orderId, r);
    if (why) return { kind: "not-returnable", why };
    const quote = quoteReturn(r.order, lines, now);
    if (!quote.ok) return { kind: "invalid", error: quote.error, lines: quote.lines };
    const year = amsterdamYear(now);
    const number = returnNumber(year, await nextNumber(conn, "return", year));
    let returnId: number;
    try {
      const [ins] = await conn.query(
        `INSERT INTO returns (number, order_id, open_order_id, status, locale, currency, lines_cents, shipping_cents, customer_note, requested_at)
         VALUES (?, ?, ?, 'REQUESTED', ?, 'EUR', ?, ?, ?, ?)`,
        [number, orderId, orderId, order.locale, quote.lines.amount, quote.shipping.amount, note || null, toDbTime(now)],
      );
      returnId = Number((ins as { insertId: number }).insertId);
    } catch (err) {
      // Another tab was first: the database says there is an open return (a unique key, not a check in code).
      if (isDuplicateKey(err)) return { kind: "not-returnable", why: "open-return" };
      throw err;
    }
    for (const l of lines.filter((x) => x.quantity > 0)) {
      await conn.query("INSERT INTO return_lines (return_id, line_no, quantity, reason) VALUES (?, ?, ?, ?)", [returnId, l.lineNo, l.quantity, l.reason]);
    }
    await conn.query("INSERT INTO return_events (return_id, from_status, to_status, actor, at) VALUES (?, NULL, 'REQUESTED', 'customer', ?)", [returnId, toDbTime(now)]);
    await appendAudit(conn, { actor: "customer", action: "return.requested", objectType: "order", objectId: orderId, after: { returnNumber: number, pieces: lines.reduce((s, l) => s + l.quantity, 0), maxCents: quote.total.amount }, reason: note ? "met opmerking van de klant" : null }, now);
    await enqueue(conn, "return-requested", `return:${returnId}`, { orderId, returnId }, now);
    await enqueue(conn, "admin-new-return", `return:${returnId}`, { orderId, returnId }, now);
    return { kind: "requested", number, total: quote.total, locale: order.locale, returnId };
  });
  if (result.kind === "requested") return { kind: "requested", number: result.number, total: result.total, locale: result.locale };
  return result;
}

// ------------------------------------------------------------- the admin

export type ReturnRow = {
  id: number;
  number: string;
  orderId: number;
  orderReference: string;
  status: ReturnStatus;
  lines: { lineNo: number; name: string; sku: string; quantity: number; reason: ReturnReason; unitPrice: Money }[];
  linesAmount: Money;
  shipping: Money;
  max: Money;
  refund: Money | null;
  deductionReason: string | null;
  rejectReason: string | null;
  customerNote: string | null;
  refundStatus: string | null;
  requestedAt: Date;
  receivedAt: Date | null;
  closedAt: Date | null;
};

type Raw = Record<string, string | number | null>;

async function readReturns(db: Queryable, where: string, params: unknown[]): Promise<ReturnRow[]> {
  const rows = await selectRows<Raw>(
    db,
    `SELECT r.id, r.number, r.order_id, o.reference, r.status, r.lines_cents, r.shipping_cents, r.refund_cents, r.deduction_reason, r.reject_reason,
            r.customer_note, r.requested_at, r.received_at, r.closed_at, f.status AS refund_status
       FROM returns r JOIN orders o ON o.id = r.order_id LEFT JOIN refunds f ON f.id = r.refund_id
      WHERE ${where} ORDER BY r.id DESC LIMIT 200`,
    params,
  );
  if (!rows.length) return [];
  const ids = rows.map((r) => Number(r.id));
  const lines = await selectRows<Raw>(
    db,
    `SELECT rl.return_id, rl.line_no, rl.quantity, rl.reason, l.name, l.sku, l.unit_price_cents
       FROM return_lines rl JOIN returns r ON r.id = rl.return_id JOIN order_lines l ON l.order_id = r.order_id AND l.line_no = rl.line_no
      WHERE rl.return_id IN (${ids.map(() => "?").join(", ")}) ORDER BY rl.line_no`,
    ids,
  );
  return rows.map((r) => {
    const status = String(r.status);
    if (!isReturnStatus(status)) throw new Error(`return ${String(r.id)}: unknown status ${status}`);
    const t = (k: string) => (r[k] === null ? null : fromDbTime(String(r[k])));
    return {
      id: Number(r.id),
      number: String(r.number),
      orderId: Number(r.order_id),
      orderReference: String(r.reference),
      status,
      lines: lines
        .filter((l) => Number(l.return_id) === Number(r.id))
        .map((l) => ({ lineNo: Number(l.line_no), name: String(l.name), sku: String(l.sku), quantity: Number(l.quantity), reason: (isReturnReason(l.reason) ? l.reason : "none") as ReturnReason, unitPrice: money(Number(l.unit_price_cents)) })),
      linesAmount: money(Number(r.lines_cents)),
      shipping: money(Number(r.shipping_cents)),
      max: money(Number(r.lines_cents) + Number(r.shipping_cents)),
      refund: r.refund_cents === null ? null : money(Number(r.refund_cents)),
      deductionReason: r.deduction_reason === null ? null : String(r.deduction_reason),
      rejectReason: r.reject_reason === null ? null : String(r.reject_reason),
      customerNote: r.customer_note === null ? null : String(r.customer_note),
      refundStatus: r.refund_status === null ? null : String(r.refund_status),
      requestedAt: t("requested_at")!,
      receivedAt: t("received_at"),
      closedAt: t("closed_at"),
    };
  });
}

export const returnsOfOrder = (db: Queryable, orderId: number) => readReturns(db, "r.order_id = ?", [orderId]);

/**
 * How many returns wait for the owner, and the earliest refund deadline among
 * them (the law's clock, ./amount.ts). Only counts and a date: shown to
 * every role on the dashboard, so nothing about the customer.
 */
export async function openReturnsSummary(db: Queryable): Promise<{ count: number; earliestRequestedAt: Date | null }> {
  const [row] = await selectRows<{ n: number | string; first: string | null }>(db, "SELECT COUNT(*) AS n, MIN(requested_at) AS first FROM returns WHERE status IN ('REQUESTED', 'RECEIVED', 'REFUNDING')");
  return { count: Number(row?.n ?? 0), earliestRequestedAt: row?.first ? fromDbTime(row.first) : null };
}

/** The returns tab: open ones (oldest first matters less than seeing them all), or the closed ones. */
export async function listReturns(db: Queryable, open: boolean): Promise<ReturnRow[]> {
  const marks = RETURN_CLOSED.map(() => "?").join(", ");
  return readReturns(db, `r.status ${open ? "NOT IN" : "IN"} (${marks})`, [...RETURN_CLOSED]);
}

/** Compare-and-set with an event line, in the caller's transaction. */
async function transitionReturn(
  conn: Connection,
  t: { returnId: number; from: ReturnStatus; to: ReturnStatus; actor: ReturnActor; reason?: string | null; now: Date; set?: Record<string, string | number | null> },
): Promise<void> {
  if (!canTransitionReturn(t.from, t.to, t.actor)) throw new ReturnTransitionError(`${t.from} → ${t.to} by ${t.actor} is not a return transition`);
  const closing = RETURN_CLOSED.includes(t.to);
  const set = Object.entries({ ...(t.set ?? {}), ...(closing ? { open_order_id: null, closed_at: toDbTime(t.now) } : {}) });
  const [r] = await conn.query(`UPDATE returns SET status = ?${set.map(([k]) => `, ${k} = ?`).join("")} WHERE id = ? AND status = ?`, [t.to, ...set.map(([, v]) => v), t.returnId, t.from]);
  if ((r as { affectedRows: number }).affectedRows !== 1) throw new ReturnTransitionError(`return ${t.returnId} changed during ${t.from} → ${t.to}`);
  await conn.query("INSERT INTO return_events (return_id, from_status, to_status, actor, reason, at) VALUES (?, ?, ?, ?, ?, ?)", [
    t.returnId, t.from, t.to, t.actor, t.reason?.slice(0, 200) ?? null, toDbTime(t.now),
  ]);
}

export type ReturnActionError = "not-found" | "changed" | "reason-required" | "amount-changed" | "amount-range" | "not-allowed";
export type ReturnActionResult = { ok: true; refund: "none" | "sent" | "queued" } | { ok: false; error: ReturnActionError };

/** The return and its order, locked in that order (the order's row first, as everywhere). */
async function lockReturn(conn: Connection, returnId: number): Promise<{ id: number; orderId: number; number: string; status: ReturnStatus; max: Money } | null> {
  const [head] = await selectRows<{ order_id: number | string }>(conn, "SELECT order_id FROM returns WHERE id = ?", [returnId]);
  if (!head) return null;
  await lockOrder(conn, Number(head.order_id));
  const [r] = await selectRows<Raw>(conn, "SELECT id, order_id, number, status, lines_cents, shipping_cents FROM returns WHERE id = ? FOR UPDATE", [returnId]);
  if (!r || !isReturnStatus(String(r.status))) return null;
  return { id: Number(r.id), orderId: Number(r.order_id), number: String(r.number), status: String(r.status) as ReturnStatus, max: money(Number(r.lines_cents) + Number(r.shipping_cents)) };
}

/** The parcel came in. The admin now judges the product (D-09). */
export async function receiveReturn(input: { returnId: number; expectedStatus: string; actor: string; now?: Date }): Promise<ReturnActionResult> {
  const now = input.now ?? new Date();
  return withTransaction(async (conn): Promise<ReturnActionResult> => {
    const r = await lockReturn(conn, input.returnId);
    if (!r) return { ok: false, error: "not-found" };
    if (r.status !== input.expectedStatus) return { ok: false, error: "changed" };
    if (r.status !== "REQUESTED") return { ok: false, error: "not-allowed" };
    await transitionReturn(conn, { returnId: r.id, from: r.status, to: "RECEIVED", actor: "admin", now, set: { received_at: toDbTime(now) } });
    await appendAudit(conn, { actor: input.actor, action: "return.received", objectType: "order", objectId: r.orderId, after: { returnNumber: r.number } }, now);
    return { ok: true, refund: "none" };
  });
}

/** Not approved: a reason, which the customer hears (docs/RETOUREN.md § De afhandeling). */
export async function rejectReturn(input: { returnId: number; expectedStatus: string; reason: unknown; actor: string; now?: Date }): Promise<ReturnActionResult> {
  const reason = cleanReason(input.reason);
  if (!reason) return { ok: false, error: "reason-required" };
  const now = input.now ?? new Date();
  return withTransaction(async (conn): Promise<ReturnActionResult> => {
    const r = await lockReturn(conn, input.returnId);
    if (!r) return { ok: false, error: "not-found" };
    if (r.status !== input.expectedStatus) return { ok: false, error: "changed" };
    if (r.status !== "REQUESTED" && r.status !== "RECEIVED") return { ok: false, error: "not-allowed" };
    await transitionReturn(conn, { returnId: r.id, from: r.status, to: "REJECTED", actor: "admin", reason, now, set: { reject_reason: reason } });
    await appendAudit(conn, { actor: input.actor, action: "return.rejected", objectType: "order", objectId: r.orderId, after: { returnNumber: r.number }, reason }, now);
    await enqueue(conn, "return-rejected", `return:${r.id}`, { orderId: r.orderId, returnId: r.id }, now);
    return { ok: true, refund: "none" };
  });
}

/**
 * Approved: pay back `refundCents` — the whole maximum, or less with a reason
 * (D-09, owner 2026-10-13: value lost by use). The maximum is the one stored
 * with the request; the page sends what it showed, and a different one is a
 * stale page. More than the maximum, or than is left on the payment, is
 * refused, never cut off.
 */
export async function refundReturn(
  input: { returnId: number; expectedMaxCents: number; refundCents: number; deductionReason: unknown; actor: string; now?: Date },
  provider?: PaymentProvider | null,
): Promise<ReturnActionResult> {
  const now = input.now ?? new Date();
  const outcome = await withTransaction(async (conn): Promise<{ ok: false; error: ReturnActionError } | { ok: true; refundId: string }> => {
    const r = await lockReturn(conn, input.returnId);
    if (!r) return { ok: false, error: "not-found" };
    if (r.status !== "RECEIVED") return { ok: false, error: r.status === "REQUESTED" ? "not-allowed" : "changed" };
    if (r.max.amount !== input.expectedMaxCents) return { ok: false, error: "amount-changed" };
    if (!Number.isSafeInteger(input.refundCents) || input.refundCents < 1 || input.refundCents > r.max.amount) return { ok: false, error: "amount-range" };
    const deduction = input.refundCents < r.max.amount ? cleanReason(input.deductionReason) : null;
    if (input.refundCents < r.max.amount && !deduction) return { ok: false, error: "reason-required" };
    const payment = (await paymentsOfOrder(conn, r.orderId)).find((p) => p.status === "PAID");
    if (!payment || (await refundable(conn, payment)).amount < input.refundCents) return { ok: false, error: "not-allowed" };
    const reason = `retour ${r.number}${deduction ? ` — ${deduction}` : ""}`;
    const refundId = await requestPaymentRefund(conn, payment, reason, input.actor, now, { amount: money(input.refundCents), returnId: r.id });
    if (!refundId) return { ok: false, error: "not-allowed" };
    await transitionReturn(conn, { returnId: r.id, from: "RECEIVED", to: "REFUNDING", actor: "admin", reason: deduction, now, set: { refund_cents: input.refundCents, deduction_reason: deduction, refund_id: refundId } });
    await appendAudit(conn, { actor: input.actor, action: "return.refund-requested", objectType: "order", objectId: r.orderId, after: { returnNumber: r.number, refundCents: input.refundCents, maxCents: r.max.amount }, reason: deduction }, now);
    return { ok: true, refundId };
  });
  if (!outcome.ok) return outcome;
  const p = provider === undefined ? defaultProvider() : provider;
  if (!p) return { ok: true, refund: "queued" };
  await submitRefund(outcome.refundId, p, now);
  return { ok: true, refund: "sent" };
}

/**
 * The orders job: a return whose refund the provider confirmed is REFUNDED
 * (then the mail, and the credit note in the invoicing round); one whose
 * refund failed goes back to RECEIVED, and the admin can pay back again
 * (docs/STATE_MACHINES.md § Return).
 */
export async function settleReturns(now: Date = new Date()): Promise<{ refunded: number; failed: number }> {
  const run = { refunded: 0, failed: 0 };
  const due = await selectRows<{ id: number | string; refund_status: string }>(
    getPool(),
    "SELECT r.id, f.status AS refund_status FROM returns r JOIN refunds f ON f.id = r.refund_id WHERE r.status = 'REFUNDING' AND f.status IN ('SUCCEEDED', 'FAILED') ORDER BY r.id LIMIT 100",
  );
  for (const d of due) {
    await withTransaction(async (conn) => {
      const r = await lockReturn(conn, Number(d.id));
      if (!r || r.status !== "REFUNDING") return;
      if (d.refund_status === "SUCCEEDED") {
        await transitionReturn(conn, { returnId: r.id, from: "REFUNDING", to: "REFUNDED", actor: "system", now });
        await appendAudit(conn, { actor: "system", action: "return.refunded", objectType: "order", objectId: r.orderId, after: { returnNumber: r.number } }, now);
        await enqueue(conn, "return-refunded", `return:${r.id}`, { orderId: r.orderId, returnId: r.id }, now);
        run.refunded++;
      } else {
        await transitionReturn(conn, { returnId: r.id, from: "REFUNDING", to: "RECEIVED", actor: "system", reason: "terugbetaling mislukt", now, set: { refund_cents: null, deduction_reason: null, refund_id: null } });
        // The alert went out with the failed refund itself (src/lib/payments: "refund:<id>:failed"), and it is on the dashboard.
        await appendAudit(conn, { actor: "system", action: "return.refund-failed", objectType: "order", objectId: r.orderId, after: { returnNumber: r.number } }, now);
        run.failed++;
      }
    });
  }
  return run;
}

/** For the mails: one return with its lines, and the order's locale. */
export async function readReturn(db: Queryable, returnId: number): Promise<ReturnRow | null> {
  return (await readReturns(db, "r.id = ?", [returnId]))[0] ?? null;
}
