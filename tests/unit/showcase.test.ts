// What the hero on the home page shows (src/lib/catalog/showcase.ts,
// docs/SCHERMEN.md § Home): promotions when they run, otherwise surely
// deliverable products — never an empty hero.

import { describe, expect, it } from "vitest";
import { heroShowcase } from "@/lib/catalog/showcase";
import type { Product } from "@/lib/catalog/types";
import { money } from "@/lib/money";

function product(id: string, stock: number, percent: number | null = null, availability: Product["availability"] = "in_stock"): Product {
  return {
    id, source: "bigbuy", slug: `p-${id}`, name: `P ${id}`, brand: null, sku: `S${id}`, ean: null, price: money(1000),
    promotion: percent === null ? null : { id: `a${id}`, listPrice: money(1250), shownPercent: percent, endsAt: "2026-12-01T00:00:00.000Z" },
    vatRateBasisPoints: 2100, availability, stock, offerId: `${id}-1`,
    delivery: { minWorkingDays: 3, maxWorkingDays: 6, shipsFrom: "ES" }, shippingAlone: money(858), imageUrls: [],
    categoryKey: "wonen", subcategoryKey: "opslag", specs: [], description: [], safety: { manufacturer: null, warnings: [] }, addedAt: "2026-01-01",
  };
}
const ids = (s: ReturnType<typeof heroShowcase>) => s.products.map((p) => p.id);

describe("the hero beside the search", () => {
  it("promotions first: the deepest discount, then the deepest stock, at most three", () => {
    const s = heroShowcase([product("1", 5, 10), product("2", 50, 20), product("3", 9, 20), product("4", 99), product("5", 1, 15)]);
    expect(s.kind).toBe("promotions");
    expect(ids(s)).toEqual(["2", "3", "5"]);
  });

  it("one promotion is enough to show promotions", () => {
    const s = heroShowcase([product("1", 99), product("2", 1, 12)]);
    expect(s).toMatchObject({ kind: "promotions" });
    expect(ids(s)).toEqual(["2"]);
  });

  it("no promotion: still a hero, with the most surely deliverable products", () => {
    const s = heroShowcase([product("1", 5), product("2", 50), product("3", 9), product("4", 20)]);
    expect(s.kind).toBe("featured");
    expect(ids(s)).toEqual(["2", "4", "3"]);
  });

  it("a promotion that gives nothing, or a product that cannot be bought now, does not count", () => {
    const s = heroShowcase([product("1", 5, 0), product("2", 0, 30), product("3", 9, 25, "backorder"), product("4", 7)]);
    expect(s.kind).toBe("featured");
    expect(ids(s)).toEqual(["4", "1"]);
  });

  it("an empty catalogue: no products, and the page shows the hero without the panel", () => {
    expect(heroShowcase([])).toEqual({ kind: "featured", products: [] });
  });
});
