// The catalog as the rest of the shop sees it: canonical Products only.
// From the mock (default) or from the database copy the refresh keeps up to
// date (D-31, CATALOG_SOURCE). The shop must always work without a token
// (CLAUDE.md § Bouwvolgorde). Server-side only.

import { getPool, hasDatabase, selectRows } from "@/lib/db";
import type { Locale } from "@/lib/i18n/config";
import { fromDecimal, money, type Money } from "@/lib/money";
import type { BigBuyInformation } from "./bigbuy/dto";
import { parseInformation, parseLowestShipping, parseProduct, parseStock } from "./bigbuy/dto";
import { toProduct, type SupplierRecord } from "./bigbuy/map";
import { catalogVersion, loadDatabaseCatalog } from "./bigbuy/read";
import { SOURCE } from "./bigbuy/store";
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
  // Keyed by sku ("reference"), as the supplier sends it.
  const shipping = new Map(fixtures.lowestShipping.map(parseLowestShipping).filter((x) => x !== null).map((x) => [x.reference, x]));
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
      shipping: shipping.get(product.sku) ?? null,
      taxonomyPath: taxonomyPath(product.taxonomy),
      brand: product.manufacturer !== null ? (brands.get(product.manufacturer) ?? null) : null,
    });
  }
  return records;
}

export type CatalogSource = "mock" | "database";

/**
 * Where the catalog comes from (D-31): "mock" (the default, and what the live
 * site keeps until the price rule is decided, D-03) or "database" (the copy
 * the refresh keeps up to date). Checked when the code loads.
 */
export function catalogSource(env: Record<string, string | undefined>, databaseConfigured: boolean): CatalogSource {
  const value = (env.CATALOG_SOURCE ?? "").trim() || "mock";
  if (value !== "mock" && value !== "database") throw new Error(`CATALOG_SOURCE must be "mock" or "database" (got ${JSON.stringify(value)}).`);
  if (value === "database" && !databaseConfigured) throw new Error("CATALOG_SOURCE=database needs the DATABASE_* settings (D-06).");
  return value;
}

const source = catalogSource(process.env, hasDatabase);

const mockCache = new Map<Locale, Product[]>();

function mockCatalog(locale: Locale): Product[] {
  let products = mockCache.get(locale);
  if (!products) {
    products = mockRecords()
      .map((r) => toProduct(locale, r).product)
      .filter((p): p is Product => p !== null);
    mockCache.set(locale, products);
  }
  return products;
}

/** How often the shop asks the database whether a newer copy is there. */
const VERSION_CHECK_MS = 60_000;
let version: { value: number | null; checkedAt: number } | null = null;
const dbCache = new Map<Locale, { version: number | null; products: Promise<Product[]> }>();
/** The last copy that loaded, per language: shown while the database is out of reach. */
const lastGood = new Map<Locale, Product[]>();

async function databaseCatalog(locale: Locale): Promise<Product[]> {
  try {
    if (!version || Date.now() - version.checkedAt > VERSION_CHECK_MS) version = { value: await catalogVersion(), checkedAt: Date.now() };
    const current = version.value;
    let entry = dbCache.get(locale);
    if (!entry || entry.version !== current) {
      // One load per version, shared by every request that arrives meanwhile.
      entry = { version: current, products: current === null ? Promise.resolve([]) : loadDatabaseCatalog(locale) };
      dbCache.set(locale, entry);
      entry.products.catch(() => dbCache.delete(locale));
    }
    const products = await entry.products;
    lastGood.set(locale, products);
    return products;
  } catch {
    // docs/SUPPLIER_RESILIENCE.md: the database briefly out of reach — keep
    // showing the copy we had; without one, an honest "not now".
    version = null;
    const previous = lastGood.get(locale);
    if (previous) return previous;
    throw new SupplierUnavailableError();
  }
}

/** Every product that passes the selection rule (D-02), in one language. */
export async function getCatalog(locale: Locale): Promise<Product[]> {
  if (mockScenario() === "unavailable") throw new SupplierUnavailableError();
  return source === "database" ? databaseCatalog(locale) : mockCatalog(locale);
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

/**
 * What the supplier charges for one piece, for the order snapshot
 * (docs/DATAMODEL.md § OrderLine). Server-only, never part of Product
 * (D-16: the purchase price does not reach the browser). Keyed
 * "source:productId"; a product without a known cost is missing from the map.
 */
export async function getSupplierCosts(ids: { source: string; productId: string }[]): Promise<Map<string, Money>> {
  const wanted = ids.filter((i) => i.source === SOURCE && /^\d{1,12}$/.test(i.productId));
  const costs = new Map<string, Money>();
  if (!wanted.length) return costs;
  if (source === "database") {
    const rows = await selectRows<{ product_id: number | string; cost_cents: number | string }>(
      getPool(),
      "SELECT product_id, cost_cents FROM catalog_products WHERE source = ? AND product_id IN (?)",
      [SOURCE, wanted.map((i) => Number(i.productId))],
    );
    for (const r of rows) costs.set(`${SOURCE}:${r.product_id}`, money(Number(r.cost_cents)));
    return costs;
  }
  const byId = new Map(fixtures.products.map(parseProduct).filter((p) => p !== null).map((p) => [String(p.id), p]));
  for (const { productId } of wanted) {
    const p = byId.get(productId);
    if (p) costs.set(`${SOURCE}:${productId}`, fromDecimal(p.wholesalePrice));
  }
  return costs;
}
