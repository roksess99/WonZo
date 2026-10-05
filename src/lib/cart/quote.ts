// What a cart costs right now, from the catalog — never from the browser.
// The same function serves the cart page now and the checkout later, so every
// screen shows the same amount (docs/PRIJZEN.md, docs/TESTEN.md § Unit).
// Pure: the caller loads the catalog.

import type { Delivery, Product } from "@/lib/catalog/types";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { add, money, multiply, type Money } from "@/lib/money";
import { shippingFor, type Shipping, type ShippingPolicy, shippingPolicy } from "@/lib/pricing/shipping";
import { checkLine, MAX_LINES, type CartLine } from "./cart";

export type QuoteLine = CartLine &
  (
    | {
        /** "limited": fewer in stock than asked; the line says so and offers one fix (docs/SCHERMEN.md). */
        status: "ok" | "limited";
        product: { name: string; slug: string; sku: string; imageUrl: string | null; stock: number; delivery: Delivery };
        unitPrice: Money;
        lineTotal: Money;
      }
    | {
        /** No longer in the shop: sold out, or no longer passing the selection rule (D-02). */
        status: "unavailable";
      }
  );

export type CartQuote = {
  lines: QuoteLine[];
  /** Pieces on lines that can be priced. */
  itemCount: number;
  /** Sum of the priced lines, incl. VAT. */
  subtotal: Money;
  shipping: Shipping;
  /** Subtotal plus shipping when shipping is known; otherwise the subtotal. */
  total: Money;
  totalIncludesShipping: boolean;
  /** The slowest line decides when everything is there. */
  delivery: { minWorkingDays: number; maxWorkingDays: number; shipsFrom: string[] } | null;
  /** Only when every line is "ok": nothing to resolve first. */
  readyForCheckout: boolean;
};

export function quoteCart(lines: CartLine[], catalog: Product[], policy: ShippingPolicy | null = shippingPolicy): CartQuote {
  const byId = new Map(catalog.map((p) => [`${p.source}:${p.id}`, p]));
  let subtotal = money(0);
  let itemCount = 0;
  let delivery: CartQuote["delivery"] = null;

  const quoted: QuoteLine[] = lines.map((line) => {
    const p = byId.get(`${line.source}:${line.productId}`);
    if (!p) return { ...line, status: "unavailable" };
    const lineTotal = multiply(p.price, line.quantity);
    subtotal = add(subtotal, lineTotal);
    itemCount += line.quantity;
    delivery = {
      minWorkingDays: Math.max(delivery?.minWorkingDays ?? 0, p.delivery.minWorkingDays),
      maxWorkingDays: Math.max(delivery?.maxWorkingDays ?? 0, p.delivery.maxWorkingDays),
      shipsFrom: [...new Set([...(delivery?.shipsFrom ?? []), p.delivery.shipsFrom])],
    };
    return {
      ...line,
      status: line.quantity > p.stock ? "limited" : "ok",
      product: { name: p.name, slug: p.slug, sku: p.sku, imageUrl: p.imageUrls[0] ?? null, stock: p.stock, delivery: p.delivery },
      unitPrice: p.price,
      lineTotal,
    };
  });

  const shipping: Shipping = itemCount > 0 ? shippingFor(subtotal, policy) : { kind: "unknown" };
  return {
    lines: quoted,
    itemCount,
    subtotal,
    shipping,
    total: shipping.kind === "fee" ? add(subtotal, shipping.amount) : subtotal,
    totalIncludesShipping: shipping.kind !== "unknown",
    delivery,
    readyForCheckout: quoted.length > 0 && quoted.every((l) => l.status === "ok"),
  };
}

export type QuoteRequest = { locale: Locale; lines: CartLine[] };

/**
 * The body of a quote request, checked at the edge (.claude/rules/beveiliging.md).
 * Strict, unlike reading browser storage: a request with a bad line is refused.
 */
export function parseQuoteRequest(input: unknown): { ok: true; request: QuoteRequest } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "body" };
  const { locale, lines } = input as Record<string, unknown>;
  if (typeof locale !== "string" || !isLocale(locale)) return { ok: false, error: "locale" };
  if (!Array.isArray(lines) || lines.length > MAX_LINES) return { ok: false, error: "lines" };
  const checked: CartLine[] = [];
  for (const item of lines) {
    const c = checkLine(item);
    if (!c.ok) return { ok: false, error: `line: ${c.error}` };
    if (checked.some((l) => l.source === c.line.source && l.productId === c.line.productId)) return { ok: false, error: "line: duplicate" };
    checked.push(c.line);
  }
  return { ok: true, request: { locale, lines: checked } };
}
