// The catalog as the rest of the shop sees it: canonical Products only.
// Without a supplier token the mock is used — the shop must always work
// without a token (CLAUDE.md § Bouwvolgorde). Server-side only.

import type { Locale } from "@/lib/i18n/config";
import type { BigBuyInformation } from "./bigbuy/dto";
import { parseInformation, parseProduct, parseStock } from "./bigbuy/dto";
import { toProduct, type SupplierRecord } from "./bigbuy/map";
import * as fixtures from "./fixtures";
import type { Product } from "./types";

export class SupplierUnavailableError extends Error {
  constructor() {
    super("Supplier catalog unavailable");
  }
}

/** docs/SUPPLIER_RESILIENCE.md § Fixtures: pick a failure state in development. */
function mockScenario(): string {
  return process.env.CATALOG_MOCK_SCENARIO ?? "";
}

function taxonomyPath(id: number): string[] {
  const byId = new Map(fixtures.taxonomies.map((t) => [t.id, t]));
  const names: string[] = [];
  let cur = byId.get(id);
  for (let guard = 0; cur && guard < 10; guard++) {
    names.unshift(cur.name);
    cur = cur.parentTaxonomy ? byId.get(cur.parentTaxonomy) : undefined;
  }
  return names;
}

function mockRecords(): SupplierRecord[] {
  const stock = new Map(fixtures.stock.map(parseStock).filter((s) => s !== null).map((s) => [s.id, s]));
  const info = (lang: "nl" | "en") =>
    new Map(fixtures.information[lang].map(parseInformation).filter((i): i is BigBuyInformation => i !== null).map((i) => [i.id, i]));
  const nl = info("nl");
  const en = info("en");
  const images = new Map(fixtures.images.map((i) => [i.id, i]));
  const compliance = new Map(fixtures.compliance.map((c) => [c.id, c]));
  const brands = new Map(fixtures.manufacturers.map((m) => [m.id, m.name]));

  const records: SupplierRecord[] = [];
  for (const raw of fixtures.products) {
    const product = parseProduct(raw);
    if (!product) continue; // docs/SUPPLIER_RESILIENCE.md: skip in lists, log and count in fase 3
    records.push({
      product,
      stock: stock.get(product.id) ?? null,
      info: { nl: nl.get(product.id), en: en.get(product.id) },
      images: images.get(product.id) ?? null,
      compliance: compliance.get(product.id) ?? null,
      taxonomyPath: taxonomyPath(product.taxonomy),
      brand: product.manufacturer !== null ? (brands.get(product.manufacturer) ?? null) : null,
    });
  }
  return records;
}

const cache = new Map<Locale, Product[]>();

/** Every product that passes the selection rule (D-02), in one language. */
export async function getCatalog(locale: Locale): Promise<Product[]> {
  if (mockScenario() === "unavailable") throw new SupplierUnavailableError();
  // TODO fase 3: with SUPPLIER_API_TOKEN set, read the synchronised copy of the supplier catalog (D-31).
  let products = cache.get(locale);
  if (!products) {
    products = mockRecords()
      .map((r) => toProduct(locale, r).product)
      .filter((p): p is Product => p !== null);
    cache.set(locale, products);
  }
  return products;
}

/**
 * The catalog, or null when the supplier is unavailable. Pages use this so
 * loading (which may fail) and rendering (which must not be in a try) stay
 * apart; a broken supplier gives an honest state, never an error page
 * (docs/SUPPLIER_RESILIENCE.md).
 */
export async function getCatalogOrUnavailable(locale: Locale): Promise<Product[] | null> {
  try {
    return await getCatalog(locale);
  } catch (err) {
    if (err instanceof SupplierUnavailableError) return null;
    throw err;
  }
}

export async function getProduct(locale: Locale, id: string): Promise<Product | null> {
  return (await getCatalog(locale)).find((p) => p.id === id) ?? null;
}
