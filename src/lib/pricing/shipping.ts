// Shipping costs for an order. Pure: the cart, the checkout and the order
// must get the same answer from the same function (.claude/rules/geld.md).

import { compare, subtract, type Money } from "@/lib/money";

export type ShippingPolicy = {
  /** Charged below the threshold. */
  fee: Money;
  /** Free from this subtotal on (incl. VAT); null = never free. */
  freeFrom: Money | null;
};

/**
 * D-13 is open: there is no fee and no threshold yet, and none is invented
 * here. Research: docs/ONDERZOEK.md § 8; supplier cost: scripts/measure-shipping.mjs.
 */
// TODO D-13: the fee and threshold the owner decides.
export const shippingPolicy: ShippingPolicy | null = null;

export type Shipping =
  | { kind: "unknown" }
  | { kind: "free" }
  | { kind: "fee"; amount: Money; remainingForFree: Money | null };

/**
 * Shipping for a subtotal incl. VAT. "Free from € X" means at or above X
 * (an order of exactly X ships free). VAT on shipping is D-15; this returns
 * the amount the customer pays.
 */
export function shippingFor(subtotal: Money, policy: ShippingPolicy | null = shippingPolicy): Shipping {
  if (!policy) return { kind: "unknown" };
  if (policy.freeFrom && compare(subtotal, policy.freeFrom) >= 0) return { kind: "free" };
  return {
    kind: "fee",
    amount: policy.fee,
    remainingForFree: policy.freeFrom ? subtract(policy.freeFrom, subtotal) : null,
  };
}
