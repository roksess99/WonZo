// Price building (docs/PRIJZEN.md). Pure: the page, the cart and the server
// must get the same amount from the same function.

import type { Money } from "@/lib/money";

/**
 * Until the price rule of D-03 (with the floor of D-16): "no price rule means
 * the supplier's advised price" (docs/PRIJZEN.md § 1). BigBuy confirmed on
 * 2026-11-02 that the advised price is excluding VAT (docs/api/VRAGEN.md
 * vraag 1), so the shop adds the VAT once to get the price the customer pays.
 * Rounded half up to a cent, once: from here on the gross price is the source
 * (.claude/rules/geld.md § Rekenen), and the invoice takes the VAT out of it.
 */
export function sellingPrice(advisedExcl: Money, vatRateBp: number): Money {
  // TODO fase 3: replace with the price rule from D-03 (and the floor from D-16).
  const { amount } = advisedExcl;
  if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(vatRateBp) || vatRateBp < 0 || vatRateBp > 10_000) {
    throw new Error(`Not an advised price and rate: ${amount}, ${vatRateBp}`);
  }
  const incl = Math.floor((2 * amount * (10_000 + vatRateBp) + 10_000) / 20_000);
  if (!Number.isSafeInteger(incl)) throw new Error(`Price out of range: ${amount}`);
  return { amount: incl, currency: advisedExcl.currency };
}
