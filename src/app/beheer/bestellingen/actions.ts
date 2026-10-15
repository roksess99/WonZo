"use server";

// The admin's actions on orders. Each one checks its own permission first:
// a server action is its own way in, also when the page was never opened
// (.claude/rules/beveiliging.md § Autorisatie). Next.js compares the Origin
// of a server action with the host, which is the CSRF check
// (GEDOCUMENTEERD: node_modules/next/dist/docs/01-app/02-guides/data-security.md).

import { revalidatePath } from "next/cache";
import { AdminAccessDenied, requireAction } from "@/lib/admin/access";
import { acceptPurchasePrice, cancelAndRefund, cleanReason, refundPayment, releaseHold, resendMail, retryPurchaseAction as retryPurchase, type ActionError, type ActionResult } from "@/lib/admin/order-actions";
import { searchOrders, type OrderListRow } from "@/lib/admin/orders";
import { getPool } from "@/lib/db";
import { markDelivered } from "@/lib/orders/tracking";

export type SearchState = { kind: "idle" } | { kind: "invalid" } | { kind: "results"; rows: OrderListRow[] } | { kind: "denied" };

/**
 * Search by order number or e-mail address. A POST on purpose: an e-mail
 * address in a URL ends up in logs (.claude/rules/beveiliging.md §
 * Persoonsgegevens en logging).
 */
export async function searchAction(_: SearchState, form: FormData): Promise<SearchState> {
  try {
    await requireAction("bestellingen");
  } catch (err) {
    if (err instanceof AdminAccessDenied) return { kind: "denied" };
    throw err;
  }
  const rows = await searchOrders(getPool(), String(form.get("zoek") ?? ""));
  return rows ? { kind: "results", rows } : { kind: "invalid" };
}

export type OrderActionState = { ok: null } | ActionResult | { ok: false; error: ActionError | "access" };

const id = (x: FormDataEntryValue | null) => {
  const n = Number(x);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const cents = (x: FormDataEntryValue | null) => {
  const n = Number(x);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};

async function run(permission: "bestellingen" | "terugbetalen", orderId: number | null, act: (actor: string, orderId: number) => Promise<ActionResult>): Promise<OrderActionState> {
  let actor: string;
  try {
    actor = (await requireAction(permission)).actor;
  } catch (err) {
    if (err instanceof AdminAccessDenied) return { ok: false, error: "access" };
    throw err;
  }
  if (!orderId) return { ok: false, error: "not-found" };
  const result = await act(actor, orderId);
  revalidatePath(`/beheer/bestellingen/${orderId}`);
  return result;
}

export async function releaseHoldAction(_: OrderActionState, form: FormData): Promise<OrderActionState> {
  return run("bestellingen", id(form.get("orderId")), (actor, orderId) =>
    releaseHold({ orderId, expectedHold: String(form.get("expectedHold") ?? ""), reason: form.get("reason"), actor }),
  );
}

export async function cancelAndRefundAction(_: OrderActionState, form: FormData): Promise<OrderActionState> {
  const expected = cents(form.get("expectedRefundCents"));
  return run("terugbetalen", id(form.get("orderId")), (actor, orderId) =>
    expected === null ? Promise.resolve({ ok: false, error: "amount-changed" }) : cancelAndRefund({ orderId, expectedRefundCents: expected, reason: form.get("reason"), actor }),
  );
}

const uuid = (x: FormDataEntryValue | null) => {
  const v = String(x ?? "");
  return /^[0-9a-f-]{36}$/.test(v) ? v : null;
};

export async function acceptPriceAction(_: OrderActionState, form: FormData): Promise<OrderActionState> {
  const expected = cents(form.get("expectedCheckedCents"));
  const supplierOrderId = uuid(form.get("supplierOrderId"));
  return run("bestellingen", id(form.get("orderId")), (actor, orderId) =>
    expected === null || !supplierOrderId
      ? Promise.resolve({ ok: false, error: "changed" })
      : acceptPurchasePrice({ orderId, supplierOrderId, expectedCheckedCents: expected, reason: form.get("reason"), actor }),
  );
}

export async function retryPurchaseFormAction(_: OrderActionState, form: FormData): Promise<OrderActionState> {
  const supplierOrderId = uuid(form.get("supplierOrderId"));
  return run("bestellingen", id(form.get("orderId")), (actor, orderId) =>
    !supplierOrderId ? Promise.resolve({ ok: false, error: "changed" }) : retryPurchase({ orderId, supplierOrderId, reason: form.get("reason"), actor }),
  );
}

export async function resendMailAction(_: OrderActionState, form: FormData): Promise<OrderActionState> {
  const outboxId = id(form.get("outboxId"));
  return run("bestellingen", id(form.get("orderId")), (actor, orderId) =>
    !outboxId ? Promise.resolve({ ok: false, error: "changed" }) : resendMail({ orderId, outboxId, reason: form.get("reason"), actor }),
  );
}

/** The admin marks the order delivered: the withdrawal window starts now (D-09). */
export async function markDeliveredAction(_: OrderActionState, form: FormData): Promise<OrderActionState> {
  return run("bestellingen", id(form.get("orderId")), async (actor, orderId) => {
    const reason = cleanReason(form.get("reason"));
    if (!reason) return { ok: false, error: "reason-required" };
    const r = await markDelivered({ orderId, reason, actor });
    return r.ok ? { ok: true, refund: "none" } : { ok: false, error: r.error };
  });
}

export async function refundPaymentAction(_: OrderActionState, form: FormData): Promise<OrderActionState> {
  const expected = cents(form.get("expectedRefundCents"));
  const paymentId = String(form.get("paymentId") ?? "");
  return run("terugbetalen", id(form.get("orderId")), (actor, orderId) =>
    expected === null || !/^[0-9a-f-]{36}$/.test(paymentId)
      ? Promise.resolve({ ok: false, error: "amount-changed" })
      : refundPayment({ orderId, paymentId, expectedRefundCents: expected, reason: form.get("reason"), actor }),
  );
}
