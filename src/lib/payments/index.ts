// Paying for an order, and paying back (docs/PAYMENTS.md). The order of
// work is always: intent in the database and commit, then the provider, then
// the outcome in a new transaction — never a provider call inside a
// transaction (.claude/rules/database.md § Transacties). One function applies
// what the provider says (applyProviderPayment); the webhook, the return page
// and reconciliation all go through it. Server-side only.

import { randomUUID } from "node:crypto";
import { appendAudit } from "@/lib/admin/audit";
import { fromDbTime, getPool, selectRows, withTransaction, type Connection } from "@/lib/db";
import { compare } from "@/lib/money";
import { enqueue } from "@/lib/orders/outbox";
import { insideCancelWindow } from "@/lib/orders/states";
import { lockOrder, ordersWithExpiredSnapshot, setHold, transitionOrder, type LockedOrder } from "@/lib/orders/store";
import { defaultProvider, ProviderOutcomeUnknown, ProviderRefused, type PaymentProvider, type ProviderPayment } from "./mollie";
import { canTransitionPayment, fromMolliePaymentStatus, fromMollieRefundStatus, PAYMENT_OPEN, PAYMENT_STATUSES, type PaymentActor, type PaymentStatus } from "./states";
import {
  insertPayment,
  insertRefund,
  linkProviderPayment,
  linkProviderRefund,
  openPayments,
  openRefunds,
  paymentById,
  paymentByProviderId,
  paymentsOfOrder,
  recordProviderEvent,
  refundable,
  refundById,
  refundsOfPayment,
  transitionPayment,
  transitionRefund,
  type PaymentRow,
  type RefundRow,
} from "./store";

/** A payment page the customer opened in the last minutes is offered again instead of a new payment (iDEAL lives 15 minutes, D-05). */
const REUSE_PAYMENT_MS = 10 * 60_000;
/** A payment the provider never confirmed (no id) is given up after the snapshot's lifetime. */
const GIVE_UP_UNKNOWN_MS = 60 * 60_000;
/** The provider keeps an idempotency key one hour (D-05): resending with the same key is only safe within it. */
const IDEMPOTENCY_WINDOW_MS = 55 * 60_000;

const providerOrThrow = (p: PaymentProvider | null | undefined): PaymentProvider => {
  const provider = p === undefined ? defaultProvider() : p;
  if (!provider) throw new Error("No payment provider configured (MOLLIE_API_KEY)");
  return provider;
};
const age = (createdAt: string, now: Date) => now.getTime() - fromDbTime(createdAt).getTime();

export type StartPaymentResult =
  | { kind: "redirect"; url: string }
  /** Total zero: paid without a payment (.claude/rules/geld.md § Rekenen). */
  | { kind: "paid" }
  | { kind: "already-paid" }
  /** Expired, held or no longer payable: a new checkout is needed. */
  | { kind: "not-payable" }
  /** The provider's answer did not arrive, or another attempt is underway: try again shortly. */
  | { kind: "try-again" }
  /** The provider refused the payment. */
  | { kind: "refused" };

/**
 * Starts (or resumes) paying for an order: docs/PAYMENTS.md steps 3–6.
 * Safe to call twice: a recent payment page is offered again.
 */
export async function startPayment(
  s: { orderId: number; redirectUrl: string; webhookUrl: string | null; now?: Date },
  providerArg?: PaymentProvider | null,
): Promise<StartPaymentResult> {
  const provider = providerOrThrow(providerArg);
  const now = s.now ?? new Date();

  // Transaction A: the intent, with the order row locked.
  const intent = await withTransaction(async (conn): Promise<StartPaymentResult | { kind: "created"; payment: PaymentRow; order: LockedOrder }> => {
    const order = await lockOrder(conn, s.orderId);
    if (!order) return { kind: "not-payable" };
    const payments = await paymentsOfOrder(conn, order.id);
    if (order.status === "PAID" || payments.some((p) => p.status === "PAID")) return { kind: "already-paid" };
    if ((order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_FAILED") || order.holdReason || now >= order.snapshotExpiresAt) return { kind: "not-payable" };
    const recent = payments.find((p) => p.status === "PENDING" && p.checkoutUrl && age(p.createdAt, now) < REUSE_PAYMENT_MS);
    if (recent) return { kind: "redirect", url: recent.checkoutUrl! };
    // A payment still on its way to the provider (a double click): do not start a second one.
    if (payments.some((p) => p.status === "CREATED" && age(p.createdAt, now) < 60_000)) return { kind: "try-again" };

    if (order.status === "PAYMENT_FAILED") await transitionOrder(conn, { orderId: order.id, to: "PENDING_PAYMENT", actor: "customer", reason: "nieuwe betaalpoging", now });
    if (order.total.amount === 0) {
      await transitionOrder(conn, { orderId: order.id, to: "PAID", actor: "system", reason: "totaal € 0", now });
      return { kind: "paid" };
    }
    const payment: PaymentRow = { id: randomUUID(), orderId: order.id, status: "CREATED", amount: order.total, providerPaymentId: null, checkoutUrl: null, createdAt: "" };
    await insertPayment(conn, { id: payment.id, orderId: order.id, amount: order.total, now });
    return { kind: "created", payment, order };
  });
  if (intent.kind !== "created") return intent;
  const { payment, order } = intent;

  // The provider call, outside any transaction, with our id as the key.
  let answer: ProviderPayment;
  try {
    answer = await provider.createPayment({
      key: payment.id,
      amount: payment.amount,
      description: `WonZo ${order.reference}`,
      redirectUrl: s.redirectUrl,
      webhookUrl: s.webhookUrl,
      locale: order.locale,
      metadata: { orderId: order.id, paymentId: payment.id },
    });
  } catch (err) {
    if (err instanceof ProviderOutcomeUnknown) {
      await withTransaction((conn) => transitionPayment(conn, { paymentId: payment.id, to: "UNKNOWN", actor: "system", reason: "geen antwoord van de betaaldienst", now }));
      return { kind: "try-again" };
    }
    if (err instanceof ProviderRefused) {
      await withTransaction(async (conn) => {
        await lockOrder(conn, order.id);
        await transitionPayment(conn, { paymentId: payment.id, to: "FAILED", actor: "provider", reason: `geweigerd (HTTP ${err.status})`, now });
        await failOrderIfNoOpenPayment(conn, order.id, "provider", now);
      });
      return { kind: "refused" };
    }
    throw err;
  }

  // Transaction B: what the provider said.
  const local = await withTransaction((conn) => applyProviderPayment(conn, payment.id, answer, "system", now));
  if (local?.status === "PAID") return { kind: "already-paid" };
  return answer.checkoutUrl ? { kind: "redirect", url: answer.checkoutUrl } : { kind: "try-again" };
}

/** Order → PAYMENT_FAILED when its last payment ended without money and nothing else is open. */
async function failOrderIfNoOpenPayment(conn: Connection, orderId: number, actor: "provider" | "reconciliation", now: Date): Promise<void> {
  const payments = await paymentsOfOrder(conn, orderId);
  if (payments.some((p) => p.status === "PAID" || PAYMENT_OPEN.includes(p.status))) return;
  const [order] = await selectRows<{ status: string }>(conn, "SELECT status FROM orders WHERE id = ?", [orderId]);
  if (order?.status === "PENDING_PAYMENT") await transitionOrder(conn, { orderId, to: "PAYMENT_FAILED", actor, reason: "betaling niet gelukt", now });
}

/**
 * The shortest way through the payment machine from `from` to `to` for this
 * actor (at most three steps): the provider may tell us "paid" about a
 * payment we only know as CREATED, or "charged back" about one that was never
 * PAID here. null: there is no allowed way.
 */
export function pathTo(from: PaymentStatus, to: PaymentStatus, actor: PaymentActor): PaymentStatus[] | null {
  let frontier: { at: PaymentStatus; path: PaymentStatus[] }[] = [{ at: from, path: [] }];
  for (let depth = 0; depth < 3; depth++) {
    const next: typeof frontier = [];
    for (const { at, path } of frontier) {
      for (const s of PAYMENT_STATUSES) {
        if (path.includes(s) || s === from || !canTransitionPayment(at, s, actor)) continue;
        if (s === to) return [...path, s];
        next.push({ at: s, path: [...path, s] });
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * Applies the provider's view of a payment to ours, inside a transaction
 * that locks the order (docs/PAYMENTS.md § Webhooks, steps 3–5). The amount
 * must equal the frozen order exactly; a payment the state machine does not
 * allow (paid after it failed, paid on a cancelled order) changes nothing and
 * becomes an alert for the owner — never an automatic fix.
 */
export async function applyProviderPayment(conn: Connection, paymentId: string, answer: ProviderPayment, actor: PaymentActor, now: Date): Promise<PaymentRow | null> {
  const before = await paymentById(conn, paymentId);
  if (!before) return null;
  const order = await lockOrder(conn, before.orderId);
  const local = (await paymentById(conn, paymentId, true))!;
  if (!local.providerPaymentId) await linkProviderPayment(conn, local.id, answer.id, answer.checkoutUrl, answer.method);
  else if (local.providerPaymentId !== answer.id) throw new Error(`payment ${local.id} belongs to ${local.providerPaymentId}, not ${answer.id}`);

  let target: PaymentStatus | null = fromMolliePaymentStatus(answer.status);
  if (target === "PAID" && answer.amountChargedBack && answer.amountChargedBack.amount > 0) target = "CHARGED_BACK";
  await recordProviderEvent(conn, answer.id, target ?? answer.status, now);
  if (!target || local.status === target) return local;

  const path = pathTo(local.status, target, actor);
  if (!path) {
    // E.g. "paid" on a payment that already failed or expired here: the owner decides.
    await enqueue(conn, "admin-alert", `payment:${paymentId}:${local.status}->${target}`, { orderId: local.orderId, paymentId, local: local.status, provider: answer.status }, now);
    return local;
  }
  for (const to of path) await transitionPayment(conn, { paymentId, to, actor, now });

  if (!order) return paymentById(conn, paymentId);
  if (target === "PAID") {
    const sameAmount = answer.amount.currency === local.amount.currency && compare(answer.amount, local.amount) === 0 && compare(local.amount, order.total) === 0;
    if (!sameAmount) await setHold(conn, order.id, "AMOUNT_MISMATCH", actor, now);
    else if (order.status === "PENDING_PAYMENT" && !order.holdReason) await transitionOrder(conn, { orderId: order.id, to: "PAID", actor: actor === "system" ? "provider" : actor, now });
    else {
      // Paid on an order that is cancelled, held or already paid by another payment: the owner decides
      // (docs/PAYMENTS.md § Reconciliatie). Never an automatic refund or reopen.
      await enqueue(conn, "admin-alert", `payment:${paymentId}:paid-on-${order.status}`, { orderId: order.id, paymentId, orderStatus: order.status }, now);
    }
  } else if (target === "CHARGED_BACK") {
    await setHold(conn, order.id, "CHARGEBACK", actor, now);
  } else if (target === "FAILED" || target === "CANCELED" || target === "EXPIRED") {
    await failOrderIfNoOpenPayment(conn, order.id, actor === "reconciliation" ? "reconciliation" : "provider", now);
  }
  return paymentById(conn, paymentId);
}

/** Asks the provider for a payment and applies it. Without a provider id there is nothing to ask. */
export async function syncPayment(paymentId: string, actor: PaymentActor, providerArg?: PaymentProvider | null, now: Date = new Date()): Promise<PaymentRow | null> {
  const provider = providerOrThrow(providerArg);
  const local = await paymentById(getPool(), paymentId);
  if (!local?.providerPaymentId) return local;
  const answer = await provider.getPayment(local.providerPaymentId);
  if (!answer) return local;
  const after = await withTransaction((conn) => applyProviderPayment(conn, paymentId, answer, actor, now));
  for (const refund of await refundsOfPayment(getPool(), paymentId)) {
    if (refund.status === "SUBMITTED" || refund.status === "UNKNOWN") await syncRefund(refund, local.providerPaymentId, actor === "system" ? "provider" : actor, provider, now);
  }
  return after;
}

/**
 * A webhook call: only an id, no signature (D-05). The id is only a reason
 * to ask the provider; nothing in the call itself is believed. An unknown id
 * gets the same quiet answer as a known one (docs/PAYMENTS.md § Webhooks).
 */
export async function handleWebhook(providerPaymentId: string, providerArg?: PaymentProvider | null, now: Date = new Date()): Promise<void> {
  if (!/^tr_[A-Za-z0-9]{4,30}$/.test(providerPaymentId)) return;
  const provider = providerOrThrow(providerArg);
  const answer = await provider.getPayment(providerPaymentId);
  if (!answer) return;
  // Ours by the stored id, or — when our record never got it — by the id in the metadata.
  let local = await paymentByProviderId(getPool(), answer.id);
  if (!local && answer.metadata.paymentId) {
    const candidate = await paymentById(getPool(), answer.metadata.paymentId);
    if (candidate && !candidate.providerPaymentId && candidate.orderId === answer.metadata.orderId) local = candidate;
  }
  if (!local) return;
  await withTransaction((conn) => applyProviderPayment(conn, local.id, answer, "provider", now));
  for (const refund of await refundsOfPayment(getPool(), local.id)) {
    if (refund.status === "SUBMITTED" || refund.status === "UNKNOWN") await syncRefund(refund, answer.id, "provider", provider, now);
  }
}

// ---------------------------------------------------------------- refunds

/**
 * Records a full refund of what is left on the order's paid payment, in the
 * caller's transaction (which holds the order row). The amount is computed
 * here, never taken from outside (.claude/rules/geld.md § Terugbetalingen).
 * Returns null when nothing is left to refund.
 */
export async function requestFullRefund(conn: Connection, orderId: number, reason: string, requestedBy: string, now: Date): Promise<string | null> {
  const paid = (await paymentsOfOrder(conn, orderId)).find((p) => p.status === "PAID");
  if (!paid) return null;
  return requestPaymentRefund(conn, paid, reason, requestedBy, now);
}

/**
 * Records a refund of what is left on one paid payment, in the caller's
 * transaction (which holds the order row): a second payment, or one on an
 * order that did not take it. Returns null when nothing is left.
 */
export async function requestPaymentRefund(conn: Connection, payment: PaymentRow, reason: string, requestedBy: string, now: Date): Promise<string | null> {
  if (payment.status !== "PAID") return null;
  const amount = await refundable(conn, payment);
  if (amount.amount === 0) return null;
  const id = randomUUID();
  await insertRefund(conn, { id, orderId: payment.orderId, paymentId: payment.id, amount, reason, requestedBy, now });
  await appendAudit(conn, { actor: requestedBy, action: "refund.requested", objectType: "order", objectId: payment.orderId, after: { refundId: id, paymentId: payment.id, amountCents: amount.amount, currency: amount.currency }, reason }, now);
  return id;
}

/** Sends a requested refund to the provider, with its id as the key. */
export async function submitRefund(refundId: string, providerArg?: PaymentProvider | null, now: Date = new Date()): Promise<RefundRow | null> {
  const provider = providerOrThrow(providerArg);
  const refund = await refundById(getPool(), refundId);
  if (!refund || refund.status !== "REQUESTED") return refund;
  const payment = await paymentById(getPool(), refund.paymentId);
  if (!payment?.providerPaymentId) throw new Error(`refund ${refundId}: payment without provider id`);
  try {
    const answer = await provider.createRefund({
      key: refund.id,
      providerPaymentId: payment.providerPaymentId,
      amount: refund.amount,
      description: `Terugbetaling WonZo`,
      metadata: { orderId: refund.orderId, refundId: refund.id },
    });
    await withTransaction(async (conn) => {
      await linkProviderRefund(conn, refund.id, answer.id);
      await transitionRefund(conn, { refundId: refund.id, to: "SUBMITTED", actor: "system", now });
    });
    await syncRefund((await refundById(getPool(), refund.id))!, payment.providerPaymentId, "provider", provider, now, answer);
  } catch (err) {
    if (err instanceof ProviderOutcomeUnknown) {
      await withTransaction((conn) => transitionRefund(conn, { refundId: refund.id, to: "UNKNOWN", actor: "system", reason: "geen antwoord van de betaaldienst", now }));
    } else if (err instanceof ProviderRefused) {
      await withTransaction(async (conn) => {
        await transitionRefund(conn, { refundId: refund.id, to: "FAILED", actor: "system", reason: `geweigerd (HTTP ${err.status})`, now });
        await enqueue(conn, "admin-alert", `refund:${refund.id}:failed`, { orderId: refund.orderId, refundId: refund.id }, now);
      });
    } else throw err;
  }
  return refundById(getPool(), refund.id);
}

async function syncRefund(
  refund: RefundRow,
  providerPaymentId: string,
  actor: PaymentActor,
  provider: PaymentProvider,
  now: Date,
  known?: { id: string; status: string },
): Promise<void> {
  let answer = known ?? null;
  if (!answer && refund.providerRefundId) answer = await provider.getRefund(providerPaymentId, refund.providerRefundId);
  if (!answer && refund.status === "UNKNOWN") {
    // Our record never got the provider's id: look for it by our id in the metadata.
    answer = (await provider.listRefunds(providerPaymentId)).find((r) => r.refundId === refund.id) ?? null;
  }
  if (!answer) return;
  const found = answer;
  await withTransaction(async (conn) => {
    if (!refund.providerRefundId) await linkProviderRefund(conn, refund.id, found.id);
    const current = (await refundById(conn, refund.id))!;
    const reconcile = actor === "reconciliation" || current.status === "UNKNOWN";
    if (current.status === "UNKNOWN") await transitionRefund(conn, { refundId: refund.id, to: "SUBMITTED", actor: "reconciliation", now });
    const target = fromMollieRefundStatus(found.status);
    if (!target) return;
    await transitionRefund(conn, { refundId: refund.id, to: target, actor: reconcile ? "reconciliation" : "provider", now });
    if (target === "FAILED") await enqueue(conn, "admin-alert", `refund:${refund.id}:failed`, { orderId: refund.orderId, refundId: refund.id }, now);
  });
}

// ---------------------------------------------------------- customer cancel

/**
 * The customer cancels inside the 30-minute window (D-04): the order goes to
 * CANCELLED and a full refund is recorded in the same transaction
 * (docs/STATE_MACHINES.md § Order), then sent to the provider.
 */
export async function cancelByCustomer(orderId: number, providerArg?: PaymentProvider | null, now: Date = new Date()): Promise<{ ok: true } | { ok: false; reason: "window-closed" }> {
  const provider = providerOrThrow(providerArg);
  const refundId = await withTransaction(async (conn) => {
    const order = await lockOrder(conn, orderId);
    if (!order || !insideCancelWindow(order.status, order.holdReason, order.cancelWindowEndsAt, now)) return false as const;
    await transitionOrder(conn, { orderId, to: "CANCELLED", actor: "customer", reason: "geannuleerd door de klant binnen het venster", now });
    return requestFullRefund(conn, orderId, "geannuleerd door de klant binnen het venster", "customer", now);
  });
  if (refundId === false) return { ok: false, reason: "window-closed" };
  if (refundId) await submitRefund(refundId, provider, now);
  return { ok: true };
}

// ----------------------------------------------------------------- the jobs

/** At most this many items per run of a job: the next run continues. */
const JOB_MAX_ITEMS = 500;

/** Every item a paged query returns, page after page, up to JOB_MAX_ITEMS. */
async function allPages<T, K>(page: (after: K) => Promise<T[]>, keyOf: (t: T) => K, first: K): Promise<T[]> {
  const all: T[] = [];
  let after = first;
  while (all.length < JOB_MAX_ITEMS) {
    const items = await page(after);
    if (!items.length) break;
    all.push(...items);
    after = keyOf(items[items.length - 1]!);
  }
  return all.slice(0, JOB_MAX_ITEMS);
}

/**
 * Unpaid orders past their 60 minutes: ask the provider about every payment
 * first, and cancel only when nothing was paid and nothing is still open
 * (docs/PAYMENTS.md § Snapshot en verloop).
 */
export async function expireUnpaidOrders(providerArg?: PaymentProvider | null, now: Date = new Date()): Promise<{ cancelled: number[] }> {
  const provider = providerOrThrow(providerArg);
  const cancelled: number[] = [];
  const expired = await allPages((after: number) => ordersWithExpiredSnapshot(getPool(), now, after), (id) => id, 0);
  for (const orderId of expired) {
    try {
      for (const p of await paymentsOfOrder(getPool(), orderId)) {
        if (PAYMENT_OPEN.includes(p.status)) await syncPayment(p.id, "reconciliation", provider, now);
      }
    } catch (err) {
      if (err instanceof ProviderOutcomeUnknown) continue; // ask again next round
      throw err;
    }
    const done = await withTransaction(async (conn) => {
      const order = await lockOrder(conn, orderId);
      if (!order || (order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_FAILED")) return false;
      const payments = await paymentsOfOrder(conn, orderId);
      if (payments.some((p) => p.status === "PAID" || PAYMENT_OPEN.includes(p.status))) return false;
      return (await transitionOrder(conn, { orderId, to: "CANCELLED", actor: "system", reason: "verlopen: niet betaald binnen 60 minuten", now })).changed;
    });
    if (done) cancelled.push(orderId);
  }
  return { cancelled };
}

/**
 * Reconciliation (docs/PAYMENTS.md § Reconciliatie): payments and refunds
 * still open after a few minutes are asked again; a payment the provider
 * never confirmed is given up after an hour; a refund whose request was never
 * sent is sent now. Every correction goes through the same functions as the webhook.
 */
export async function reconcile(providerArg?: PaymentProvider | null, now: Date = new Date()): Promise<{ payments: number; refunds: number }> {
  const provider = providerOrThrow(providerArg);
  const before = new Date(now.getTime() - 2 * 60_000);
  let payments = 0;
  let refunds = 0;
  for (const p of await allPages((after: string) => openPayments(getPool(), before, after), (x) => x.id, "")) {
    try {
      if (p.providerPaymentId) {
        await syncPayment(p.id, "reconciliation", provider, now);
      } else if (age(p.createdAt, now) > GIVE_UP_UNKNOWN_MS) {
        // The customer never got a payment page for it, so it cannot have been paid.
        await withTransaction(async (conn) => {
          await lockOrder(conn, p.orderId);
          await transitionPayment(conn, { paymentId: p.id, to: "FAILED", actor: "reconciliation", reason: "nooit bevestigd door de betaaldienst", now });
          await failOrderIfNoOpenPayment(conn, p.orderId, "reconciliation", now);
        });
      }
      payments++;
    } catch (err) {
      if (!(err instanceof ProviderOutcomeUnknown)) throw err;
    }
  }
  for (const r of await allPages((after: string) => openRefunds(getPool(), before, after), (x) => x.id, "")) {
    try {
      const payment = await paymentById(getPool(), r.paymentId);
      if (!payment?.providerPaymentId) continue;
      if (r.status === "REQUESTED") {
        // Recorded but never sent (a crash after the commit). Within the key's hour a resend is safe.
        if (age(r.createdAt, now) < IDEMPOTENCY_WINDOW_MS) await submitRefund(r.id, provider, now);
        else await withTransaction((conn) => enqueue(conn, "admin-alert", `refund:${r.id}:never-sent`, { orderId: r.orderId, refundId: r.id }, now));
      } else {
        await syncRefund(r, payment.providerPaymentId, "reconciliation", provider, now);
        const after = await refundById(getPool(), r.id);
        if (after?.status === "UNKNOWN" && !after.providerRefundId && age(r.createdAt, now) > IDEMPOTENCY_WINDOW_MS) {
          // Not at the provider after the key's hour: it never arrived. The owner can request a new one.
          await withTransaction(async (conn) => {
            await transitionRefund(conn, { refundId: r.id, to: "FAILED", actor: "reconciliation", reason: "niet aangekomen bij de betaaldienst", now });
            await enqueue(conn, "admin-alert", `refund:${r.id}:failed`, { orderId: r.orderId, refundId: r.id }, now);
          });
        }
      }
      refunds++;
    } catch (err) {
      if (!(err instanceof ProviderOutcomeUnknown)) throw err;
    }
  }
  return { payments, refunds };
}
