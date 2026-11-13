// What an order freezes: the lines, amounts and offer as the customer saw
// them, from the same quote as the cart page (src/lib/cart/quote.ts) — never
// from the browser (.claude/rules/geld.md § Wat de browser mag meesturen).
// Pure: the caller loads catalog and costs.

import { createHash } from "node:crypto";
import type { CartLine } from "@/lib/cart/cart";
import type { CartQuote } from "@/lib/cart/quote";
import type { Product } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n/config";
import { add, money, subtract, type Currency, type Money } from "@/lib/money";
import type { CustomerDetails } from "./customer";

export type SnapshotLine = {
  lineNo: number;
  source: CartLine["source"];
  productId: string;
  offerId: string;
  name: string;
  brand: string | null;
  sku: string;
  quantity: number;
  unitPrice: Money;
  /** The price before a promotion; the same as unitPrice without one. */
  listPrice: Money;
  /** The promotion that gave unitPrice (D-08), for "why this price" afterwards. */
  promotionId: string | null;
  lineTotal: Money;
  /** This line's share of the discount code (D-15): VAT and a return work from lineTotal minus this. */
  codeDiscount: Money;
  vatRateBasisPoints: number;
  /** Own shipping costs per piece for a large item (D-13). */
  largeShipping: Money | null;
  /** What the supplier charges for one piece (the purchase part of the landed cost, D-16). */
  supplierCost: Money;
  minDays: number;
  maxDays: number;
  shipsFrom: string;
};

export type Snapshot = {
  currency: Currency;
  lines: SnapshotLine[];
  subtotal: Money;
  /** The discount code that applied, as the customer typed it (normalised). */
  code: { id: string; text: string; percentBp: number } | null;
  discount: Money;
  shippingStandard: Money;
  shippingLarge: Money;
  total: Money;
};

export class SnapshotError extends Error {}

/**
 * Freezes a quote that is ready for checkout. Throws when it is not, or when
 * a line has no product or cost: the order path refuses what the cart page
 * would only show (.claude/rules/catalogus.md § Schema aan de rand).
 */
export function freeze(quote: CartQuote, products: Product[], costs: Map<string, Money>): Snapshot {
  if (!quote.readyForCheckout) throw new SnapshotError("quote not ready for checkout");
  if (quote.code?.kind === "refused") throw new SnapshotError("a refused code is never frozen");
  const byKey = new Map(products.map((p) => [`${p.source}:${p.id}`, p]));
  const lines: SnapshotLine[] = quote.lines.map((l, i) => {
    if (l.status === "unavailable") throw new SnapshotError("unavailable line");
    const key = `${l.source}:${l.productId}`;
    const p = byKey.get(key);
    const cost = costs.get(key);
    if (!p || !cost) throw new SnapshotError(`no product or cost for ${key}`);
    return {
      lineNo: i + 1,
      source: l.source,
      productId: l.productId,
      offerId: p.offerId,
      name: p.name,
      brand: p.brand,
      sku: p.sku,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      listPrice: p.promotion?.listPrice ?? l.unitPrice,
      promotionId: p.promotion?.id ?? null,
      lineTotal: l.lineTotal,
      codeDiscount: l.codeDiscount,
      vatRateBasisPoints: p.vatRateBasisPoints,
      largeShipping: l.largeShipping,
      supplierCost: cost,
      minDays: p.delivery.minWorkingDays,
      maxDays: p.delivery.maxWorkingDays,
      shipsFrom: p.delivery.shipsFrom,
    };
  });
  const standard = quote.shipping.standard.kind === "fee" ? quote.shipping.standard.amount : money(0);
  const large = quote.shipping.large;
  // The quote's own total must be what we freeze; a difference is a bug, not a rounding.
  if (add(add(subtract(quote.subtotal, quote.discount), standard), large).amount !== quote.total.amount) throw new SnapshotError("shipping does not add up to the quote total");
  if (lines.reduce((s, l) => s + l.codeDiscount.amount, 0) !== quote.discount.amount) throw new SnapshotError("code shares do not add up to the discount");
  const code = quote.code?.kind === "applied" ? { id: quote.code.codeId, text: quote.code.code, percentBp: quote.code.percentBp } : null;
  return { currency: quote.total.currency, lines, subtotal: quote.subtotal, code, discount: quote.discount, shippingStandard: standard, shippingLarge: large, total: quote.total };
}

/**
 * A hash of what was asked, for the checkout key: the same key with other
 * content is refused (docs/IDEMPOTENCY.md § De regels). Line order does not
 * matter; the customer details do.
 */
export function requestHash(locale: Locale, lines: CartLine[], customer: CustomerDetails, code: string | null = null): string {
  const sorted = [...lines].map((l) => [l.source, l.productId, l.quantity] as const).sort((a, b) => (`${a[0]}:${a[1]}` < `${b[0]}:${b[1]}` ? -1 : 1));
  // Without a code the hash stays what it was, so a retry of an older checkout still matches.
  const canonical = JSON.stringify({ locale, lines: sorted, customer: Object.entries(customer).sort(([a], [b]) => (a < b ? -1 : 1)), ...(code ? { code } : {}) });
  return createHash("sha256").update(canonical).digest("hex");
}
