// Checking out: place the order, then send the customer to the payment page
// (docs/PAYMENTS.md § De volgorde). And what the status page may do with an
// order — only with the key from the link, never with an order number
// (.claude/rules/beveiliging.md § Autorisatie: IDOR). Server-side only.

import { getPool, hasDatabase, withTransaction } from "@/lib/db";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { placeOrder, type PlaceOrderResult } from "@/lib/orders";
import { parseCustomer, type CustomerField, type FieldError } from "@/lib/orders/customer";
import { changeCustomerDetails, findOrderIdByToken, issueAccessToken } from "@/lib/orders/store";
import { cancelByCustomer, startPayment, syncPayment, type StartPaymentResult } from "@/lib/payments";
import { defaultProvider, ProviderOutcomeUnknown } from "@/lib/payments/mollie";
import { PAYMENT_OPEN } from "@/lib/payments/states";
import { paymentsOfOrder } from "@/lib/payments/store";
import { siteUrl } from "@/lib/seo";

/**
 * CHECKOUT_ENABLED: "true" switches checking out on. Empty or "false": off —
 * the live site keeps it off until launch (docs/CHECKLIST.md). Checked when
 * the code loads.
 */
export function checkoutEnabled(env: Record<string, string | undefined>): boolean {
  const v = (env.CHECKOUT_ENABLED ?? "").trim();
  if (v === "" || v === "false") return false;
  if (v === "true") return true;
  throw new Error(`CHECKOUT_ENABLED must be "true" or "false" (got ${JSON.stringify(v)}).`);
}

export const CHECKOUT_ON = checkoutEnabled(process.env);

/** Whether a customer can check out right now: switched on, with a database and a payment key. */
export function checkoutAvailable(): boolean {
  return CHECKOUT_ON && hasDatabase && defaultProvider() !== null;
}

/** Checking out and acting on an order, per visitor: a technical bound against abuse, not a shop policy. */
export const RATE = { checkout: { max: 20, windowMs: 10 * 60_000 }, orderAction: { max: 30, windowMs: 10 * 60_000 } };

/** The status page of an order, with its key; also where the provider sends the customer back. */
export function statusPath(locale: Locale, token: string): string {
  return localizePath(locale, `/bestelling/${token}`);
}

function paymentTargets(locale: Locale, token: string) {
  const local = siteUrl.hostname === "localhost" || siteUrl.hostname === "127.0.0.1";
  return {
    redirectUrl: new URL(statusPath(locale, token), siteUrl).toString(),
    // The provider cannot reach localhost; there the status page asks instead (D-05).
    webhookUrl: local ? null : new URL("/api/payments/webhook", siteUrl).toString(),
  };
}

export type CheckoutResult =
  /** To the payment page. */
  | { kind: "pay"; url: string }
  /** The order exists; the status page says what is next (paid, try again, expired). */
  | { kind: "order"; statusUrl: string; payment: StartPaymentResult["kind"] }
  | Exclude<PlaceOrderResult, { kind: "placed" }>
  | { kind: "off" };

export async function checkout(input: unknown, now: Date = new Date()): Promise<CheckoutResult> {
  if (!CHECKOUT_ON || !defaultProvider()) return { kind: "off" };
  const placed = await placeOrder(input, now);
  if (placed.kind !== "placed") return placed;
  const locale = (input as { locale: Locale }).locale;
  const started = await startPayment({ orderId: placed.orderId, ...paymentTargets(locale, placed.accessToken), now });
  if (started.kind === "redirect") return { kind: "pay", url: started.url };
  return { kind: "order", statusUrl: statusPath(locale, placed.accessToken), payment: started.kind };
}

export type OrderActionResult =
  | { kind: "pay"; url: string }
  | { kind: "done" }
  | { kind: "not-now"; payment?: StartPaymentResult["kind"] }
  | { kind: "window-closed" }
  | { kind: "invalid"; fields?: Partial<Record<CustomerField, FieldError>> }
  /** Unknown or malformed key: one answer for both (.claude/rules/geld.md § Nummers en toegang). */
  | { kind: "not-found" };

/** What the customer may do from the status page: pay again, cancel inside the window, change their details. */
export async function orderAction(input: unknown, now: Date = new Date()): Promise<OrderActionResult> {
  const body = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const token = typeof body.token === "string" ? body.token : "";
  const orderId = token ? await findOrderIdByToken(getPool(), token) : null;
  if (!orderId) return { kind: "not-found" };
  const locale: Locale = body.locale === "en" ? "en" : "nl";

  if (body.action === "pay") {
    if (!CHECKOUT_ON || !defaultProvider()) return { kind: "not-now" };
    // A fresh key for the way back, so the old link need not be reused.
    const fresh = await withTransaction((conn) => issueAccessToken(conn, orderId, now));
    const started = await startPayment({ orderId, ...paymentTargets(locale, fresh), now });
    if (started.kind === "redirect") return { kind: "pay", url: started.url };
    if (started.kind === "paid" || started.kind === "already-paid") return { kind: "done" };
    return { kind: "not-now", payment: started.kind };
  }
  if (body.action === "cancel") {
    if (!defaultProvider()) return { kind: "not-now" };
    const r = await cancelByCustomer(orderId, undefined, now);
    return r.ok ? { kind: "done" } : { kind: "window-closed" };
  }
  if (body.action === "details") {
    const customer = parseCustomer(body.customer);
    if (!customer.ok) return { kind: "invalid", fields: customer.errors };
    const r = await withTransaction((conn) => changeCustomerDetails(conn, { orderId, customer: customer.customer, now }));
    return r.ok ? { kind: "done" } : { kind: "window-closed" };
  }
  return { kind: "invalid" };
}

/**
 * The status page asks the provider itself about a payment that is still
 * open — the return URL proves nothing (docs/PAYMENTS.md § De terugkeerpagina).
 * Through the same function as the webhook.
 */
export async function refreshPaymentStatus(orderId: number, now: Date = new Date()): Promise<void> {
  if (!defaultProvider()) return;
  for (const p of await paymentsOfOrder(getPool(), orderId)) {
    if (PAYMENT_OPEN.includes(p.status) && p.providerPaymentId) {
      try {
        await syncPayment(p.id, "reconciliation", undefined, now);
      } catch (err) {
        // The provider out of reach: the page shows what we know, and refreshes.
        if (!(err instanceof ProviderOutcomeUnknown)) throw err;
      }
    }
  }
}
