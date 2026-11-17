// What the hero on the home page shows beside the search (docs/SCHERMEN.md
// § Home): products in a running promotion (D-08) when there are any — they
// may take the banner's place — and otherwise a few products that are surely
// deliverable, so the hero is never empty and never promises "deals soon".
// Pure: no React, no I/O.

import { applyQuery } from "./query";
import type { Product } from "./types";

export type Showcase = { kind: "promotions" | "featured"; products: Product[] };

/** How many products the hero shows: enough to look like a shop, few enough to stay calm. */
export const SHOWCASE_SIZE = 3;

/**
 * Promotions first: the deepest discount, then the deepest stock (the same
 * "surely deliverable" order as the listing), then the id. Only a discount
 * that is really there (shownPercent > 0, rounded down: docs/PRIJZEN.md § 2)
 * and only products that can be bought now. No promotion: the first products
 * of the recommended order instead.
 */
export function heroShowcase(products: Product[], size = SHOWCASE_SIZE): Showcase {
  const buyable = products.filter((p) => p.availability === "in_stock" && p.stock > 0);
  const promoted = buyable
    .filter((p) => p.promotion !== null && p.promotion.shownPercent > 0)
    .sort((a, b) => b.promotion!.shownPercent - a.promotion!.shownPercent || b.stock - a.stock || a.id.localeCompare(b.id));
  if (promoted.length) return { kind: "promotions", products: promoted.slice(0, size) };
  return { kind: "featured", products: applyQuery(buyable, { sort: "recommended" }).slice(0, size) };
}
