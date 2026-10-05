// Search, filter and sort over canonical Products. Pure, so it runs the same
// in tests and on the server; the supplier has no search (GEDOCUMENTEERD),
// so search works on WonZo's own copy.

import { normalizeForSearch } from "@/lib/text";
import type { Product } from "./types";

export const sortOptions = ["recommended", "price-asc", "price-desc", "newest"] as const;
export type SortOption = (typeof sortOptions)[number];

export type ListingQuery = {
  q?: string;
  brands?: string[];
  /** Euros, whole numbers, as typed in the filter. */
  minPrice?: number;
  maxPrice?: number;
  sort?: SortOption;
};

export function search(products: Product[], q: string): Product[] {
  const terms = normalizeForSearch(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return products.filter((p) => {
    const haystack = normalizeForSearch([p.name, p.brand ?? "", p.sku].join(" "));
    return terms.every((t) => haystack.includes(t));
  });
}

export function applyQuery(products: Product[], query: ListingQuery): Product[] {
  let list = query.q ? search(products, query.q) : [...products];
  if (query.brands?.length) {
    const wanted = new Set(query.brands);
    list = list.filter((p) => p.brand !== null && wanted.has(p.brand));
  }
  if (query.minPrice !== undefined) list = list.filter((p) => p.price.amount >= query.minPrice! * 100);
  if (query.maxPrice !== undefined) list = list.filter((p) => p.price.amount <= query.maxPrice! * 100);
  switch (query.sort ?? "recommended") {
    case "price-asc":
      return list.sort((a, b) => a.price.amount - b.price.amount || a.id.localeCompare(b.id));
    case "price-desc":
      return list.sort((a, b) => b.price.amount - a.price.amount || a.id.localeCompare(b.id));
    case "newest":
      return list.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id));
    default:
      // No sales data yet, so "recommended" is the deepest stock first: what is
      // most surely deliverable. Deterministic tie-break on id.
      return list.sort((a, b) => b.stock - a.stock || a.id.localeCompare(b.id));
  }
}

/** Brands with counts, for the filter; counted over the list before the brand filter. */
export function brandFacet(products: Product[]): { brand: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of products) if (p.brand) counts.set(p.brand, (counts.get(p.brand) ?? 0) + 1);
  return [...counts].map(([brand, count]) => ({ brand, count })).sort((a, b) => a.brand.localeCompare(b.brand));
}

/** Reads the listing query from URL search params; invalid values are ignored, not trusted. */
export function parseListingQuery(params: Record<string, string | string[] | undefined>): ListingQuery {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const many = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v : v ? [v] : []).map((s) => s.slice(0, 80)).slice(0, 20);
  };
  const int = (k: string) => {
    const v = one(k);
    if (v === undefined || !/^\d{1,6}$/.test(v.trim())) return undefined;
    return Number(v);
  };
  const sort = one("sort");
  return {
    q: one("q")?.slice(0, 100).trim() || undefined,
    brands: many("brand"),
    minPrice: int("min"),
    maxPrice: int("max"),
    sort: sortOptions.includes(sort as SortOption) ? (sort as SortOption) : undefined,
  };
}
