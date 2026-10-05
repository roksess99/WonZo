// Price building (docs/PRIJZEN.md). Pure: the page, the cart and the server
// must get the same amount from the same function.

import type { Money } from "@/lib/money";

/**
 * Fase 1 shows the supplier's advised retail price as the selling price, so
 * the screens have realistic numbers. It is test data: the real rule — mark-up,
 * floor, VAT basis (incl. or excl. not yet measured) — is D-03 with D-16.
 */
export function sellingPrice(advisedRetail: Money): Money {
  // TODO fase 3: replace with the price rule from D-03 (and the floor from D-16).
  return advisedRetail;
}
