// Placing an order (docs/PAYMENTS.md § De volgorde, step 2): the server
// quotes the cart again, freezes the result and stores it with the checkout
// key, in one transaction. Payment (step 3 onwards) comes in fase 5 (D-05).
// Server-side only.

import { randomUUID } from "node:crypto";
import { parseQuoteRequest, quoteCart, type CartQuote } from "@/lib/cart/quote";
import { getCatalog, getSupplierCosts, SupplierUnavailableError } from "@/lib/catalog/provider";
import { amsterdamYear, nextNumber, orderReference } from "@/lib/db/counters";
import { getPool, isDuplicateKey, withTransaction } from "@/lib/db";
import { parseCustomer, type CustomerField, type FieldError } from "./customer";
import { freeze, requestHash } from "./snapshot";
import { ConcurrentChangeError, findByCheckoutAttempt, insertOrder, issueAccessToken, ordersWithClosedWindow, transitionOrder, TransitionError } from "./store";

export type PlaceOrderResult =
  /** Stored, or the same request again: the same order, with a fresh key for the status link. */
  | { kind: "placed"; orderId: number; reference: string; accessToken: string; replay: boolean }
  /** Request or customer details not valid; nothing stored. */
  | { kind: "invalid"; error?: string; fields?: Partial<Record<CustomerField, FieldError>> }
  /** Something changed since the cart page (sold out, less stock): show the quote, nothing stored. */
  | { kind: "not-ready"; quote: CartQuote }
  /** The same checkout key with other content (docs/IDEMPOTENCY.md): 409. */
  | { kind: "conflict" }
  | { kind: "unavailable" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A key for one checkout attempt, made when the checkout opens (docs/IDEMPOTENCY.md § Checkout). */
export const newCheckoutAttemptId = (): string => randomUUID();

/**
 * Places an order from what the browser may send: the checkout key, the
 * cart lines (references only), the language and the customer details. Every
 * amount comes from the server's own quote (.claude/rules/geld.md).
 */
export async function placeOrder(input: unknown, now: Date = new Date()): Promise<PlaceOrderResult> {
  const body = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const attemptId = typeof body.checkoutAttemptId === "string" ? body.checkoutAttemptId.toLowerCase() : "";
  if (!UUID.test(attemptId)) return { kind: "invalid", error: "checkoutAttemptId" };
  const parsed = parseQuoteRequest({ locale: body.locale, lines: body.lines });
  if (!parsed.ok) return { kind: "invalid", error: parsed.error };
  if (!parsed.request.lines.length) return { kind: "invalid", error: "lines" };
  const customer = parseCustomer(body.customer);
  if (!customer.ok) return { kind: "invalid", fields: customer.errors };
  const { locale, lines } = parsed.request;
  const hash = requestHash(locale, lines, customer.customer);

  // The same key again (a double click, a retry after a lost answer): the
  // same order, without quoting again.
  const replay = async (): Promise<PlaceOrderResult | null> => {
    const existing = await findByCheckoutAttempt(getPool(), attemptId);
    if (!existing) return null;
    if (existing.requestHash !== hash) return { kind: "conflict" };
    const accessToken = await withTransaction((conn) => issueAccessToken(conn, existing.id, now));
    return { kind: "placed", orderId: existing.id, reference: existing.reference, accessToken, replay: true };
  };
  const earlier = await replay();
  if (earlier) return earlier;

  let products;
  try {
    products = await getCatalog(locale);
  } catch (err) {
    if (err instanceof SupplierUnavailableError) return { kind: "unavailable" };
    throw err;
  }
  const quote = quoteCart(lines, products);
  if (!quote.readyForCheckout) return { kind: "not-ready", quote };
  const snapshot = freeze(quote, products, await getSupplierCosts(lines));

  try {
    return await withTransaction(async (conn) => {
      const year = amsterdamYear(now);
      const reference = orderReference(year, await nextNumber(conn, "order", year));
      const orderId = await insertOrder(conn, { reference, checkoutAttemptId: attemptId, requestHash: hash, locale, customer: customer.customer, snapshot, now });
      const accessToken = await issueAccessToken(conn, orderId, now);
      return { kind: "placed" as const, orderId, reference, accessToken, replay: false };
    });
  } catch (err) {
    // Two submits at the same moment: the second one loses on the unique key
    // (its counter step rolls back with it) and gets the first one's order.
    if (isDuplicateKey(err)) {
      const again = await replay();
      if (again) return again;
    }
    throw err;
  }
}

/**
 * Moves paid orders whose cancel window has closed on to purchasing (D-04):
 * PAID → FULFILLMENT_PENDING, one transaction per order. Safe to run twice
 * or in parallel: an order someone else moved first is skipped.
 */
export async function releaseClosedWindows(now: Date = new Date()): Promise<{ released: number[] }> {
  const released: number[] = [];
  for (const orderId of await ordersWithClosedWindow(getPool(), now)) {
    try {
      const r = await withTransaction((conn) => transitionOrder(conn, { orderId, to: "FULFILLMENT_PENDING", actor: "system", reason: "annuleervenster voorbij", now }));
      if (r.changed) released.push(orderId);
    } catch (err) {
      if (err instanceof ConcurrentChangeError || err instanceof TransitionError) continue;
      throw err;
    }
  }
  return { released };
}

// TODO fase 5: verlopen onbetaalde orders annuleren (PENDING_PAYMENT →
// CANCELLED na snapshot_expires_at, pas na controle bij de betaaldienst dat er
// geen geslaagde betaling is — docs/PAYMENTS.md § Snapshot en verloop), en
// annuleren door de klant binnen het venster (vraagt een terugbetaling in
// dezelfde transactie, docs/STATE_MACHINES.md § Order).
