// What a cart costs right now, from the catalog — never from the browser.
// The same function serves the cart page now and the checkout later, so every
// screen shows the same amount (docs/PRIJZEN.md, docs/TESTEN.md § Unit).
// Pure: the caller loads the catalog.

import type { Delivery, Product } from "@/lib/catalog/types";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { add, money, multiply, subtract, type Money } from "@/lib/money";
import { applyCode, type CodeLookup, type CodeOutcome } from "@/lib/pricing/codes";
import { isLarge, shippingFor, shippingPolicy, type Shipping, type ShippingLine, type ShippingPolicy } from "@/lib/pricing/shipping";
import { checkLine, MAX_LINES, type CartLine } from "./cart";

export type QuoteLine = CartLine &
  (
    | {
        /** "limited": fewer in stock than asked; the line says so and offers one fix (docs/SCHERMEN.md). */
        status: "ok" | "limited";
        product: { name: string; slug: string; sku: string; imageUrl: string | null; stock: number; delivery: Delivery };
        /** Own shipping costs per piece for a large item (D-13); null for a standard item. */
        largeShipping: Money | null;
        unitPrice: Money;
        lineTotal: Money;
        /** This line's share of the discount code (D-15); zero without one. */
        codeDiscount: Money;
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
  /** The discount code, applied or why not; null when none was given. */
  code: CodeOutcome | null;
  /** What the code takes off; zero without one. */
  discount: Money;
  /** Subtotal minus the code plus shipping. */
  total: Money;
  /** The slowest line decides when everything is there. */
  delivery: { minWorkingDays: number; maxWorkingDays: number; shipsFrom: string[] } | null;
  /** Only when every line is "ok": nothing to resolve first. A refused code is shown apart; the checkout refuses to pay with it. */
  readyForCheckout: boolean;
};

/**
 * A code for the quote: what the server found for its text, and the floor
 * per piece of each product ("source:id"), which never leaves the server
 * (the quote only carries what the code took off).
 */
export type QuoteCode = { lookup: CodeLookup; floors: ReadonlyMap<string, Money> };

export function quoteCart(lines: CartLine[], catalog: Product[], policy: ShippingPolicy = shippingPolicy, code?: QuoteCode): CartQuote {
  const byId = new Map(catalog.map((p) => [`${p.source}:${p.id}`, p]));
  let subtotal = money(0);
  let itemCount = 0;
  let delivery: CartQuote["delivery"] = null;
  const shippingLines: ShippingLine[] = [];

  const quoted: QuoteLine[] = lines.map((line) => {
    const p = byId.get(`${line.source}:${line.productId}`);
    if (!p) return { ...line, status: "unavailable" };
    const lineTotal = multiply(p.price, line.quantity);
    subtotal = add(subtotal, lineTotal);
    itemCount += line.quantity;
    shippingLines.push({ shippingAlone: p.shippingAlone, quantity: line.quantity });
    delivery = {
      minWorkingDays: Math.max(delivery?.minWorkingDays ?? 0, p.delivery.minWorkingDays),
      maxWorkingDays: Math.max(delivery?.maxWorkingDays ?? 0, p.delivery.maxWorkingDays),
      shipsFrom: [...new Set([...(delivery?.shipsFrom ?? []), p.delivery.shipsFrom])],
    };
    return {
      ...line,
      status: line.quantity > p.stock ? "limited" : "ok",
      product: { name: p.name, slug: p.slug, sku: p.sku, imageUrl: p.imageUrls[0] ?? null, stock: p.stock, delivery: p.delivery },
      largeShipping: isLarge(p.shippingAlone, policy) ? p.shippingAlone : null,
      unitPrice: p.price,
      lineTotal,
      codeDiscount: money(0),
    };
  });

  // The threshold looks at the subtotal before the code: a code never makes an order more expensive (docs/PRIJZEN.md § 3).
  const shipping = shippingFor(subtotal, shippingLines, policy);
  let outcome: CodeOutcome | null = null;
  let discount = money(0);
  if (code) {
    const priced = quoted.flatMap((l, i) => (l.status === "unavailable" ? [] : [{ l, i }]));
    outcome = applyCode(
      code.lookup,
      priced.map(({ l }) => {
        const key = `${l.source}:${l.productId}`;
        const floor = code.floors.get(key);
        // No floor known: no room — the code never guesses a margin.
        return { lineTotal: l.lineTotal, promoted: byId.get(key)!.promotion !== null, room: floor ? l.lineTotal.amount - floor.amount * l.quantity : 0 };
      }),
      subtotal,
    );
    if (outcome.kind === "applied") {
      discount = outcome.discount;
      const perLine = outcome.perLine;
      priced.forEach(({ l, i }, k) => {
        quoted[i] = { ...l, codeDiscount: money(perLine[k]!) };
      });
    }
  }
  return {
    lines: quoted,
    itemCount,
    subtotal,
    shipping,
    code: outcome,
    discount,
    total: add(subtract(subtotal, discount), shipping.total),
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
