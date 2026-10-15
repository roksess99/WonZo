// Payments and refunds in the database. Every status change goes through
// one function per machine: compare-and-set, an event line, in the caller's
// transaction (docs/STATE_MACHINES.md § Gemeenschappelijke regels).

import { selectRows, toDbTime, type Connection, type Queryable } from "@/lib/db";
import { money, type Money } from "@/lib/money";
import { canTransitionPayment, canTransitionRefund, type PaymentActor, type PaymentStatus, type RefundStatus } from "./states";

export class PaymentTransitionError extends Error {}
export class PaymentConcurrentChange extends Error {}

export type PaymentRow = {
  id: string;
  orderId: number;
  status: PaymentStatus;
  amount: Money;
  providerPaymentId: string | null;
  checkoutUrl: string | null;
  createdAt: string;
};

export type RefundRow = {
  id: string;
  orderId: number;
  paymentId: string;
  status: RefundStatus;
  amount: Money;
  providerRefundId: string | null;
  createdAt: string;
};

type RawPayment = { id: string; order_id: number | string; status: string; amount_cents: number | string; provider_payment_id: string | null; checkout_url: string | null; created_at: string };
type RawRefund = { id: string; order_id: number | string; payment_id: string; status: string; amount_cents: number | string; provider_refund_id: string | null; created_at: string };

const PAYMENT_COLUMNS = "id, order_id, status, amount_cents, provider_payment_id, checkout_url, created_at";
const REFUND_COLUMNS = "id, order_id, payment_id, status, amount_cents, provider_refund_id, created_at";

const toPayment = (r: RawPayment): PaymentRow => ({
  id: r.id,
  orderId: Number(r.order_id),
  status: r.status as PaymentStatus,
  amount: money(Number(r.amount_cents)),
  providerPaymentId: r.provider_payment_id,
  checkoutUrl: r.checkout_url,
  createdAt: r.created_at,
});
const toRefund = (r: RawRefund): RefundRow => ({
  id: r.id,
  orderId: Number(r.order_id),
  paymentId: r.payment_id,
  status: r.status as RefundStatus,
  amount: money(Number(r.amount_cents)),
  providerRefundId: r.provider_refund_id,
  createdAt: r.created_at,
});

export async function insertPayment(conn: Connection, p: { id: string; orderId: number; amount: Money; now: Date }): Promise<void> {
  await conn.query("INSERT INTO payments (id, order_id, provider, status, amount_cents, currency, created_at) VALUES (?, ?, 'mollie', 'CREATED', ?, ?, ?)", [
    p.id, p.orderId, p.amount.amount, p.amount.currency, toDbTime(p.now),
  ]);
  await conn.query("INSERT INTO payment_events (payment_id, from_status, to_status, actor, at) VALUES (?, NULL, 'CREATED', 'customer', ?)", [p.id, toDbTime(p.now)]);
}

export async function paymentById(db: Queryable, id: string, forUpdate = false): Promise<PaymentRow | null> {
  const [row] = await selectRows<RawPayment>(db, `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = ?${forUpdate ? " FOR UPDATE" : ""}`, [id]);
  return row ? toPayment(row) : null;
}

export async function paymentByProviderId(db: Queryable, providerPaymentId: string): Promise<PaymentRow | null> {
  const [row] = await selectRows<RawPayment>(db, `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE provider = 'mollie' AND provider_payment_id = ?`, [providerPaymentId]);
  return row ? toPayment(row) : null;
}

export async function paymentsOfOrder(db: Queryable, orderId: number): Promise<PaymentRow[]> {
  return (await selectRows<RawPayment>(db, `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE order_id = ? ORDER BY created_at, id`, [orderId])).map(toPayment);
}

/**
 * Payments still open locally, not changed since `before`: for
 * reconciliation. Paged by id (`afterId`), so one that stays stuck never
 * hides the others.
 */
export async function openPayments(db: Queryable, before: Date, afterId = "", limit = 50): Promise<PaymentRow[]> {
  return (
    await selectRows<RawPayment>(
      db,
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE status IN ('CREATED', 'PENDING', 'AUTHORIZED', 'UNKNOWN') AND updated_at <= ? AND id > ? ORDER BY id LIMIT ?`,
      [toDbTime(before), afterId, limit],
    )
  ).map(toPayment);
}

/** The provider's id and payment page, once the provider answered. */
export async function linkProviderPayment(conn: Connection, id: string, providerPaymentId: string, checkoutUrl: string | null, method: string | null): Promise<void> {
  await conn.query("UPDATE payments SET provider_payment_id = ?, checkout_url = COALESCE(?, checkout_url), method = COALESCE(?, method) WHERE id = ? AND (provider_payment_id IS NULL OR provider_payment_id = ?)", [
    providerPaymentId, checkoutUrl, method, id, providerPaymentId,
  ]);
}

/** Moves a payment; already there is a no-op. Not allowed: PaymentTransitionError, nothing written. */
export async function transitionPayment(
  conn: Connection,
  t: { paymentId: string; to: PaymentStatus; actor: PaymentActor; reason?: string; now: Date },
): Promise<{ changed: boolean; from: PaymentStatus }> {
  const current = await paymentById(conn, t.paymentId);
  if (!current) throw new PaymentTransitionError(`payment ${t.paymentId} not found`);
  if (current.status === t.to) return { changed: false, from: current.status };
  if (!canTransitionPayment(current.status, t.to, t.actor)) throw new PaymentTransitionError(`${current.status} → ${t.to} by ${t.actor} is not a payment transition`);
  const [result] = await conn.query(`UPDATE payments SET status = ?${t.to === "PAID" ? ", paid_at = ?" : ""} WHERE id = ? AND status = ?`, [
    t.to, ...(t.to === "PAID" ? [toDbTime(t.now)] : []), t.paymentId, current.status,
  ]);
  if ((result as { affectedRows: number }).affectedRows !== 1) throw new PaymentConcurrentChange(`payment ${t.paymentId} changed during ${current.status} → ${t.to}`);
  await conn.query("INSERT INTO payment_events (payment_id, from_status, to_status, actor, reason, at) VALUES (?, ?, ?, ?, ?, ?)", [
    t.paymentId, current.status, t.to, t.actor, t.reason?.slice(0, 200) ?? null, toDbTime(t.now),
  ]);
  return { changed: true, from: current.status };
}

/**
 * A notification of the provider, once per (payment, state): a repeat
 * returns false. The processing is idempotent anyway; this is the trail.
 */
export async function recordProviderEvent(conn: Connection, resourceId: string, state: string, now: Date): Promise<boolean> {
  const [result] = await conn.query("INSERT INTO provider_events (provider, event_key, resource_id, received_at) VALUES ('mollie', ?, ?, ?) ON DUPLICATE KEY UPDATE event_key = event_key", [
    `${resourceId}:${state}`.slice(0, 120), resourceId, toDbTime(now),
  ]);
  return (result as { affectedRows: number }).affectedRows === 1;
}

export async function insertRefund(
  conn: Connection,
  r: { id: string; orderId: number; paymentId: string; amount: Money; reason: string; requestedBy: string; now: Date; returnId?: number | null },
): Promise<void> {
  await conn.query("INSERT INTO refunds (id, order_id, payment_id, status, amount_cents, currency, reason, requested_by, return_id, created_at) VALUES (?, ?, ?, 'REQUESTED', ?, ?, ?, ?, ?, ?)", [
    r.id, r.orderId, r.paymentId, r.amount.amount, r.amount.currency, r.reason.slice(0, 200), r.requestedBy.slice(0, 60), r.returnId ?? null, toDbTime(r.now),
  ]);
  await conn.query("INSERT INTO refund_events (refund_id, from_status, to_status, actor, at) VALUES (?, NULL, 'REQUESTED', ?, ?)", [r.id, r.requestedBy.slice(0, 20), toDbTime(r.now)]);
}

export async function refundById(db: Queryable, id: string): Promise<RefundRow | null> {
  const [row] = await selectRows<RawRefund>(db, `SELECT ${REFUND_COLUMNS} FROM refunds WHERE id = ?`, [id]);
  return row ? toRefund(row) : null;
}

export async function refundsOfPayment(db: Queryable, paymentId: string): Promise<RefundRow[]> {
  return (await selectRows<RawRefund>(db, `SELECT ${REFUND_COLUMNS} FROM refunds WHERE payment_id = ? ORDER BY created_at, id`, [paymentId])).map(toRefund);
}

/** Refunds still open, not changed since `before`; paged by id like openPayments. */
export async function openRefunds(db: Queryable, before: Date, afterId = "", limit = 50): Promise<RefundRow[]> {
  return (
    await selectRows<RawRefund>(db, `SELECT ${REFUND_COLUMNS} FROM refunds WHERE status IN ('REQUESTED', 'SUBMITTED', 'UNKNOWN') AND updated_at <= ? AND id > ? ORDER BY id LIMIT ?`, [
      toDbTime(before), afterId, limit,
    ])
  ).map(toRefund);
}

export async function linkProviderRefund(conn: Connection, id: string, providerRefundId: string): Promise<void> {
  await conn.query("UPDATE refunds SET provider_refund_id = ? WHERE id = ? AND (provider_refund_id IS NULL OR provider_refund_id = ?)", [providerRefundId, id, providerRefundId]);
}

export async function transitionRefund(
  conn: Connection,
  t: { refundId: string; to: RefundStatus; actor: PaymentActor; reason?: string; now: Date },
): Promise<{ changed: boolean; from: RefundStatus }> {
  const current = await refundById(conn, t.refundId);
  if (!current) throw new PaymentTransitionError(`refund ${t.refundId} not found`);
  if (current.status === t.to) return { changed: false, from: current.status };
  if (!canTransitionRefund(current.status, t.to, t.actor)) throw new PaymentTransitionError(`${current.status} → ${t.to} by ${t.actor} is not a refund transition`);
  const [result] = await conn.query("UPDATE refunds SET status = ? WHERE id = ? AND status = ?", [t.to, t.refundId, current.status]);
  if ((result as { affectedRows: number }).affectedRows !== 1) throw new PaymentConcurrentChange(`refund ${t.refundId} changed during ${current.status} → ${t.to}`);
  await conn.query("INSERT INTO refund_events (refund_id, from_status, to_status, actor, reason, at) VALUES (?, ?, ?, ?, ?, ?)", [
    t.refundId, current.status, t.to, t.actor, t.reason?.slice(0, 200) ?? null, toDbTime(t.now),
  ]);
  return { changed: true, from: current.status };
}

/**
 * What may still be refunded on a payment: paid minus every refund that is
 * not FAILED. Run inside the transaction that holds the order row
 * (.claude/rules/geld.md § Terugbetalingen: the sum is enforced with a lock).
 */
export async function refundable(conn: Connection, payment: PaymentRow): Promise<Money> {
  const [row] = await selectRows<{ s: number | string | null }>(conn, "SELECT SUM(amount_cents) AS s FROM refunds WHERE payment_id = ? AND status <> 'FAILED'", [payment.id]);
  const left = payment.amount.amount - Number(row?.s ?? 0);
  // More refunded than paid can only be a bug: stop, never round it to zero (.claude/rules/geld.md § Buiten bereik).
  if (left < 0) throw new Error(`payment ${payment.id}: refunds exceed the paid amount`);
  return money(left);
}
