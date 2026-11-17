// What the admin may do with an order that asks for attention (D-07, owner
// 2026-10-12: the admin chooses). Every money action follows
// .claude/rules/beveiliging.md § Destructieve en financiële handelingen: a
// reason, the amount computed here and compared with what the confirmation
// showed, the status checked under the order's row lock, an audit line —
// then the provider, after the commit (intent first, docs/PAYMENTS.md).
// The caller has already checked the permission (./access.ts). Server-side only.

import { appendAudit } from "@/lib/admin/audit";
import { getPool, toDbTime, withTransaction, type Connection } from "@/lib/db";
import { add, compare, money, subtract, type Money } from "@/lib/money";
import { canTransition, type OrderStatus } from "@/lib/orders/states";
import type { SupplierOrdering } from "@/lib/catalog/ordering";
import { acceptPrice, cancelOpenPurchases, lookupPurchaseNow, retryPurchase, supplierOrdersOf } from "@/lib/orders/purchasing";
import { lockOrder, transitionOrder } from "@/lib/orders/store";
import { AT_SUPPLIER } from "@/lib/orders/supplier-states";
import { requestPaymentRefund, submitRefund } from "@/lib/payments";
import { defaultProvider, type PaymentProvider } from "@/lib/payments/mollie";
import { PAYMENT_OPEN } from "@/lib/payments/states";
import { paymentsOfOrder, refundable } from "@/lib/payments/store";
import type { AdminOrder } from "./orders";

export type ActionError =
  | "reason-required"
  | "not-found"
  /** The order changed since the page was opened: look again. */
  | "changed"
  | "not-allowed"
  /** The amount to refund is not what the confirmation showed. */
  | "amount-changed"
  /** The purchase order is (or may be) at the supplier: cancelling there is not something the shop can do (D-04). */
  | "at-supplier"
  /** Ordering at the supplier is off (SUPPLIER_ORDERING): there is nobody to ask. */
  | "ordering-off";

export type ActionResult =
  | { ok: true; refund: "none" | "sent" | "queued" }
  | { ok: false; error: ActionError };

/** A paid order the customer has; its first paid payment is the one it took. */
const PAID_STATUSES: readonly OrderStatus[] = ["PAID", "FULFILLMENT_PENDING", "PURCHASED", "PARTIALLY_FULFILLED", "SHIPPED", "DELIVERED", "COMPLETED"];

export function cleanReason(reason: unknown): string | null {
  if (typeof reason !== "string") return null;
  const r = reason.trim().replace(/\s+/g, " ");
  return r.length >= 3 && r.length <= 200 ? r : null;
}

/** What is left to refund on a payment, from the order as the page shows it. */
export function openOnPayment(order: Pick<AdminOrder, "payments" | "refunds">, paymentId: string): Money {
  const p = order.payments.find((x) => x.id === paymentId);
  if (!p || p.status !== "PAID") return money(0);
  return order.refunds.filter((r) => r.paymentId === paymentId && r.status !== "FAILED").reduce((left, r) => subtract(left, r.amount), p.amount);
}

export type AdminOptions = {
  /** Lift the hold and let the order go on (the purchase follows by itself once the window is closed). */
  releaseHold: boolean;
  /** Cancel, with what is left on the payment the order took paid back (may be zero, e.g. after a chargeback). */
  cancel: { refund: Money } | null;
  /** Paid payments the order did not take: to give back. */
  refundPayments: { paymentId: string; open: Money }[];
  /** Held before it was paid (a different amount came in): cancelling pays back everything that was paid (owner 2026-10-13). */
  heldUnpaid: boolean;
  /** The supplier asks more than 10 % above the frozen price (D-04): order anyway at this price. */
  acceptPrice: { supplierOrderId: string; expected: Money; checked: Money } | null;
  /** 24 hours of refusals (D-04): try again for another 24 hours. */
  retryPurchase: { supplierOrderId: string; error: string } | null;
  /** Mail that could not go out: send again once the cause is solved. */
  resendMails: { outboxId: number; kind: string }[];
  /** Purchased and not delivered as far as we know: the admin can mark it delivered (the supplier's status words are not measured yet). */
  markDelivered: boolean;
  /** A purchase order without a clear answer: ask the supplier now, by our reference (never order again). */
  lookupPurchase: { supplierOrderId: string } | null;
};

/**
 * Which buttons the order page shows. The same rules are checked again in the
 * action, under the row lock; this only decides what to offer.
 */
export function adminOptions(order: AdminOrder): AdminOptions {
  const paid = order.payments.filter((p) => p.status === "PAID");
  const taken = PAID_STATUSES.includes(order.status) ? paid[0] : undefined;
  const open = order.status === "FULFILLMENT_PENDING" ? order.purchases : [];
  const blocked = open.find((p) => p.blockedReason === "PRICE_INCREASE" && (p.status === "DRAFT" || p.status === "REJECTED"));
  const gaveUp = open.find((p) => p.gaveUpAt !== null && !p.blockedReason && (p.status === "DRAFT" || p.status === "REJECTED"));
  const heldUnpaid = order.holdReason !== null && !PAID_STATUSES.includes(order.status) && order.status !== "CANCELLED";
  const cancellable = heldUnpaid || (PAID_STATUSES.includes(order.status) && canTransition(order.status, "CANCELLED", "admin"));
  return {
    releaseHold: order.holdReason !== null && PAID_STATUSES.includes(order.status),
    cancel:
      cancellable && !order.purchases.some((p) => AT_SUPPLIER.includes(p.status))
        ? { refund: heldUnpaid ? paid.reduce((sum, p) => add(sum, openOnPayment(order, p.id)), money(0)) : taken ? openOnPayment(order, taken.id) : money(0) }
        : null,
    refundPayments: heldUnpaid
      ? []
      : paid.filter((p) => p !== taken).map((p) => ({ paymentId: p.id, open: openOnPayment(order, p.id) })).filter((x) => x.open.amount > 0),
    heldUnpaid,
    acceptPrice: blocked && blocked.checkedProducts ? { supplierOrderId: blocked.id, expected: blocked.expectedCost, checked: blocked.checkedProducts } : null,
    retryPurchase: gaveUp ? { supplierOrderId: gaveUp.id, error: gaveUp.lastError ?? "" } : null,
    resendMails: order.failedMails.map((x) => ({ outboxId: x.id, kind: x.kind })),
    lookupPurchase: (() => {
      const unknown = order.purchases.find((p) => p.status === "UNKNOWN");
      return unknown ? { supplierOrderId: unknown.id } : null;
    })(),
    markDelivered:
      ["PURCHASED", "PARTIALLY_FULFILLED", "SHIPPED"].includes(order.status) &&
      order.holdReason === null &&
      order.purchases.length > 0 &&
      order.purchases.every((p) => ["PLACED", "PARTIALLY_SHIPPED", "SHIPPED", "DELIVERED"].includes(p.status)),
  };
}

async function liftHold(conn: Connection, orderId: number, holdReason: string, reason: string, actor: string, now: Date): Promise<boolean> {
  const [result] = await conn.query("UPDATE orders SET hold_reason = NULL WHERE id = ? AND hold_reason = ?", [orderId, holdReason]);
  if ((result as { affectedRows: number }).affectedRows !== 1) return false;
  await appendAudit(conn, { actor, action: "order.hold-released", objectType: "order", objectId: orderId, before: { holdReason }, after: { holdReason: null }, reason }, now);
  return true;
}

/**
 * Sends a recorded refund. Without a payment key it stays REQUESTED and
 * reconciliation sends it once there is one; no answer from the provider is
 * handled inside submitRefund (UNKNOWN). Anything else is a bug and is thrown.
 */
async function send(refundIds: string | null | (string | null)[], provider: PaymentProvider | null | undefined, now: Date): Promise<"none" | "sent" | "queued"> {
  const ids = (Array.isArray(refundIds) ? refundIds : [refundIds]).filter((x): x is string => x !== null);
  if (!ids.length) return "none";
  const p = provider === undefined ? defaultProvider() : provider;
  if (!p) return "queued";
  for (const id of ids) await submitRefund(id, p, now);
  return "sent";
}

export async function releaseHold(input: { orderId: number; expectedHold: string; reason: unknown; actor: string; now?: Date }): Promise<ActionResult> {
  const reason = cleanReason(input.reason);
  if (!reason) return { ok: false, error: "reason-required" };
  const now = input.now ?? new Date();
  return withTransaction(async (conn): Promise<ActionResult> => {
    const order = await lockOrder(conn, input.orderId);
    if (!order) return { ok: false, error: "not-found" };
    if (order.holdReason !== input.expectedHold) return { ok: false, error: "changed" };
    if (!PAID_STATUSES.includes(order.status)) return { ok: false, error: "not-allowed" };
    if (!(await liftHold(conn, order.id, order.holdReason, reason, input.actor, now))) return { ok: false, error: "changed" };
    return { ok: true, refund: "none" };
  });
}

/**
 * Cancels a paid order and pays back what is left on the payment it took
 * (docs/STATE_MACHINES.md: PAID or FULFILLMENT_PENDING → CANCELLED by admin,
 * refund REQUESTED in the same transaction). A hold is lifted in the same
 * transaction, with its own audit line: cancelling is how it is solved.
 * An order held before it was paid (a different amount came in) is cancelled
 * the same way, with every paid payment paid back (owner 2026-10-13).
 */
export async function cancelAndRefund(
  input: { orderId: number; expectedRefundCents: number; reason: unknown; actor: string; now?: Date },
  provider?: PaymentProvider | null,
): Promise<ActionResult> {
  const reason = cleanReason(input.reason);
  if (!reason) return { ok: false, error: "reason-required" };
  const now = input.now ?? new Date();
  const outcome = await withTransaction(async (conn): Promise<{ ok: false; error: ActionError } | { ok: true; refundIds: (string | null)[] }> => {
    const order = await lockOrder(conn, input.orderId);
    if (!order) return { ok: false, error: "not-found" };
    if (!canTransition(order.status, "CANCELLED", "admin")) return { ok: false, error: "not-allowed" };
    const payments = await paymentsOfOrder(conn, order.id);
    const unpaid = !PAID_STATUSES.includes(order.status);
    // Unpaid: only a held order, and only once nothing is still open at Mollie (that could still be paid).
    if (unpaid && (!order.holdReason || payments.some((p) => PAYMENT_OPEN.includes(p.status)))) return { ok: false, error: "not-allowed" };
    // BigBuy has no cancel call (D-04): once a purchase order may be there, cancelling is a ticket at BigBuy, not a button here.
    if ((await supplierOrdersOf(conn, order.id, true)).some((s) => AT_SUPPLIER.includes(s.status))) return { ok: false, error: "at-supplier" };
    const paid = payments.filter((p) => p.status === "PAID");
    const toRefund = unpaid ? paid : paid.slice(0, 1);
    let amount = money(0);
    for (const p of toRefund) amount = add(amount, await refundable(conn, p));
    if (compare(amount, money(input.expectedRefundCents)) !== 0) return { ok: false, error: "amount-changed" };
    if (order.holdReason && !(await liftHold(conn, order.id, order.holdReason, reason, input.actor, now))) return { ok: false, error: "changed" };
    await cancelOpenPurchases(conn, order.id, reason, now);
    await transitionOrder(conn, { orderId: order.id, to: "CANCELLED", actor: "admin", reason, now });
    await appendAudit(conn, { actor: input.actor, action: "order.cancelled", objectType: "order", objectId: order.id, before: { status: order.status }, after: { status: "CANCELLED" }, reason }, now);
    const refundIds: (string | null)[] = [];
    for (const p of toRefund) refundIds.push(await requestPaymentRefund(conn, p, reason, input.actor, now));
    return { ok: true, refundIds };
  });
  if (!outcome.ok) return outcome;
  return { ok: true, refund: await send(outcome.refundIds, provider, now) };
}

/** The owner lets a purchase above the 10 % be ordered anyway, at the price the supplier asked (D-04). */
export async function acceptPurchasePrice(input: { orderId: number; supplierOrderId: string; expectedCheckedCents: number; reason: unknown; actor: string; now?: Date }): Promise<ActionResult> {
  const reason = cleanReason(input.reason);
  if (!reason) return { ok: false, error: "reason-required" };
  const now = input.now ?? new Date();
  return withTransaction(async (conn): Promise<ActionResult> => {
    const order = await lockOrder(conn, input.orderId);
    if (!order) return { ok: false, error: "not-found" };
    if (order.status !== "FULFILLMENT_PENDING" || !(await supplierOrdersOf(conn, order.id)).some((p) => p.id === input.supplierOrderId)) return { ok: false, error: "not-allowed" };
    const r = await acceptPrice(conn, { supplierOrderId: input.supplierOrderId, expectedCheckedCents: input.expectedCheckedCents, actor: input.actor, reason, now });
    return r === "ok" ? { ok: true, refund: "none" } : { ok: false, error: "changed" };
  });
}

/** After 24 hours of refusals the owner tries again (D-04), e.g. after topping up the balance. */
export async function retryPurchaseAction(input: { orderId: number; supplierOrderId: string; reason: unknown; actor: string; now?: Date }): Promise<ActionResult> {
  const reason = cleanReason(input.reason);
  if (!reason) return { ok: false, error: "reason-required" };
  const now = input.now ?? new Date();
  return withTransaction(async (conn): Promise<ActionResult> => {
    const order = await lockOrder(conn, input.orderId);
    if (!order) return { ok: false, error: "not-found" };
    if (order.status !== "FULFILLMENT_PENDING" || !(await supplierOrdersOf(conn, order.id)).some((p) => p.id === input.supplierOrderId)) return { ok: false, error: "not-allowed" };
    const r = await retryPurchase(conn, { supplierOrderId: input.supplierOrderId, actor: input.actor, reason, now });
    return r === "ok" ? { ok: true, refund: "none" } : { ok: false, error: "changed" };
  });
}

/** Asks the supplier now about a purchase order of this order that is UNKNOWN; read only at the supplier. */
export async function lookupPurchase(input: { orderId: number; supplierOrderId: string; actor: string; now?: Date }, ordering: SupplierOrdering | null): Promise<ActionResult> {
  const now = input.now ?? new Date();
  if (!ordering) return { ok: false, error: "ordering-off" };
  const own = await supplierOrdersOf(getPool(), input.orderId);
  if (!own.some((p) => p.id === input.supplierOrderId && p.status === "UNKNOWN")) return { ok: false, error: "changed" };
  const outcome = await lookupPurchaseNow(ordering, input.supplierOrderId, now);
  if (outcome === "changed") return { ok: false, error: "changed" };
  await withTransaction((conn) => appendAudit(conn, { actor: input.actor, action: "purchase.lookup", objectType: "order", objectId: input.orderId, after: { outcome } }, now));
  return { ok: true, refund: "none" };
}

/** A FAILED mail of this order back in the queue, tried as if new (at least once: the customer may get it twice if it did arrive). */
export async function resendMail(input: { orderId: number; outboxId: number; reason: unknown; actor: string; now?: Date }): Promise<ActionResult> {
  const reason = cleanReason(input.reason);
  if (!reason) return { ok: false, error: "reason-required" };
  const now = input.now ?? new Date();
  return withTransaction(async (conn): Promise<ActionResult> => {
    const [r] = await conn.query(
      "UPDATE outbox SET status = 'PENDING', attempts = 0, next_attempt_at = ? WHERE id = ? AND status = 'FAILED' AND JSON_VALUE(payload, '$.orderId') = ?",
      [toDbTime(now), input.outboxId, input.orderId],
    );
    if ((r as { affectedRows: number }).affectedRows !== 1) return { ok: false, error: "changed" };
    await appendAudit(conn, { actor: input.actor, action: "mail.resend", objectType: "order", objectId: input.orderId, after: { outboxId: input.outboxId }, reason }, now);
    return { ok: true, refund: "none" };
  });
}

/** Pays back a payment the order did not take: a second payment, or one after the order expired or failed. */
export async function refundPayment(
  input: { orderId: number; paymentId: string; expectedRefundCents: number; reason: unknown; actor: string; now?: Date },
  provider?: PaymentProvider | null,
): Promise<ActionResult> {
  const reason = cleanReason(input.reason);
  if (!reason) return { ok: false, error: "reason-required" };
  const now = input.now ?? new Date();
  const outcome = await withTransaction(async (conn): Promise<{ ok: false; error: ActionError } | { ok: true; refundId: string | null }> => {
    const order = await lockOrder(conn, input.orderId);
    if (!order) return { ok: false, error: "not-found" };
    if (order.holdReason !== null) return { ok: false, error: "not-allowed" };
    const paid = (await paymentsOfOrder(conn, order.id)).filter((p) => p.status === "PAID");
    const payment = paid.find((p) => p.id === input.paymentId);
    if (!payment) return { ok: false, error: "not-found" };
    // The payment the order took is paid back by cancelling the order, never on its own.
    if (PAID_STATUSES.includes(order.status) && payment === paid[0]) return { ok: false, error: "not-allowed" };
    const amount = await refundable(conn, payment);
    if (amount.amount === 0 || compare(amount, money(input.expectedRefundCents)) !== 0) return { ok: false, error: "amount-changed" };
    return { ok: true, refundId: await requestPaymentRefund(conn, payment, reason, input.actor, now) };
  });
  if (!outcome.ok) return outcome;
  return { ok: true, refund: await send(outcome.refundId, provider, now) };
}
