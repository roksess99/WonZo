// Shipping costs for an order (D-13). Pure: the product page, the cart, the
// checkout and the order must get the same answer from the same function
// (.claude/rules/geld.md).

import { add, compare, money, multiply, subtract, type Money } from "@/lib/money";

export type ShippingPolicy = {
  /** Charged for the standard parcel below the threshold. */
  fee: Money;
  /** Standard shipping is free from this subtotal on (incl. VAT). */
  freeFrom: Money;
  /** A product the supplier charges more than this to ship alone is a large item. */
  largeAbove: Money;
};

/**
 * Decided by the owner on 2026-10-05 (D-13): € 5,95 below € 50, free from
 * € 50; a product costing more than € 15 to ship alone is a large item with
 * its own shipping costs, outside free shipping. Measurement behind it:
 * docs/ONDERZOEK.md § 8.3.
 */
export const shippingPolicy: ShippingPolicy = {
  fee: money(595),
  freeFrom: money(5000),
  largeAbove: money(1500),
};

export function isLarge(shippingAlone: Money, policy: ShippingPolicy = shippingPolicy): boolean {
  return compare(shippingAlone, policy.largeAbove) > 0;
}

/** What one product page says about shipping. */
export type ProductShipping = { kind: "standard"; fee: Money; freeFrom: Money } | { kind: "large"; perPiece: Money };

export function productShipping(shippingAlone: Money, policy: ShippingPolicy = shippingPolicy): ProductShipping {
  // AANNAME (D-13): the supplier's amount is charged as is; whether it is incl. or excl. VAT is not measured.
  return isLarge(shippingAlone, policy) ? { kind: "large", perPiece: shippingAlone } : { kind: "standard", fee: policy.fee, freeFrom: policy.freeFrom };
}

export type ShippingLine = { shippingAlone: Money; quantity: number };

export type Shipping = {
  /** The parcel with all standard items; "none" when the order has only large items. */
  standard: { kind: "none" } | { kind: "free" } | { kind: "fee"; amount: Money; remainingForFree: Money };
  /** Own shipping costs of the large items, per piece; never free. */
  large: Money;
  total: Money;
};

/**
 * Shipping for an order. The threshold counts the whole subtotal incl. VAT
 * ("free from € 50" means at or above € 50); it makes the standard parcel
 * free, never the large items. VAT on shipping is D-15.
 */
export function shippingFor(subtotal: Money, lines: ShippingLine[], policy: ShippingPolicy = shippingPolicy): Shipping {
  let large = money(0);
  let hasStandard = false;
  for (const l of lines) {
    if (isLarge(l.shippingAlone, policy)) large = add(large, multiply(l.shippingAlone, l.quantity));
    else hasStandard = true;
  }
  const standard: Shipping["standard"] = !hasStandard
    ? { kind: "none" }
    : compare(subtotal, policy.freeFrom) >= 0
      ? { kind: "free" }
      : { kind: "fee", amount: policy.fee, remainingForFree: subtract(policy.freeFrom, subtotal) };
  return { standard, large, total: standard.kind === "fee" ? add(large, standard.amount) : large };
}
