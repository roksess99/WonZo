// The catalog as the rest of the shop sees it: canonical Products only.
// From the mock (default) or from the database copy the refresh keeps up to
// date (D-31, CATALOG_SOURCE). The shop must always work without a token
// (CLAUDE.md § Bouwvolgorde). Server-side only.

import { getPool, hasDatabase, selectRows } from "@/lib/db";
import type { Locale } from "@/lib/i18n/config";
import { fromDecimal, money, type Money } from "@/lib/money";
import type { BigBuyInformation } from "./bigbuy/dto";
import { parseInformation, parseLowestShipping, parseProduct, parseStock } from "./bigbuy/dto";
import { toProduct, type PricingContext, type SupplierRecord } from "./bigbuy/map";
import { catalogVersion, loadDatabaseRecords } from "./bigbuy/read";
import { SOURCE } from "./bigbuy/store";
import * as fixtures from "./fixtures";
import type { Product } from "./types";
import { loadPricing, pricingVersion, type Pricing } from "@/lib/discounts/store";
import { NO_RULES, promotionActive, type PriceInput, type PriceOutcome } from "@/lib/pricing/rules";

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

/** The source this shop runs on: the layout shows the test banner only while it is the mock. */
export function activeCatalogSource(): CatalogSource {
  return source;
}

/** How often the shop asks the database whether a newer copy, or a changed price rule, is there. */
const VERSION_CHECK_MS = 60_000;

// ---------------------------------------------------------------- the price rule (D-03, D-08)

let pricingState: { pricing: Pricing; checkedAt: number } | null = null;

/**
 * The rules and promotions the owner set (src/lib/discounts/store.ts), at
 * most a minute old. Without a database: none (the advised price). With a
 * database that is out of reach: the rules we had; without those, "not now"
 * — never a quiet fall back to other prices.
 */
async function currentPricing(): Promise<Pricing | null> {
  if (!hasDatabase) return null;
  if (pricingState && Date.now() - pricingState.checkedAt < VERSION_CHECK_MS) return pricingState.pricing;
  try {
    const v = await pricingVersion(getPool());
    const pricing = pricingState && pricingState.pricing.version === v ? pricingState.pricing : await loadPricing(getPool(), new Date());
    pricingState = { pricing, checkedAt: Date.now() };
    return pricing;
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    // Before migration 0012 there is no table, so there can be no rule: the advised price is then simply true.
    if (code === "ER_NO_SUCH_TABLE") return null;
    console.error("[catalog] price rules", code ?? (err instanceof Error ? err.name : "unknown"));
    if (pricingState) return pricingState.pricing;
    throw new SupplierUnavailableError();
  }
}

/** Ask for the rules now, not within the minute: after the owner saved them in this process. */
export function forgetPricing(): void {
  pricingState = null;
}

/** The context to price with now, and a key that changes when a promotion starts or ends or a rule changes. */
async function pricingNow(): Promise<{ key: string; context: PricingContext }> {
  const now = new Date();
  const pricing = await currentPricing();
  if (!pricing) return { key: "none", context: { rules: NO_RULES, promotions: [], now } };
  const active = pricing.promotions.filter((p) => promotionActive(p, now));
  // A cache must never let through what has ended (.claude/rules/catalogus.md § Caching): the key holds the running promotions.
  return { key: `${pricing.version}:${active.map((p) => p.id).join(",")}`, context: { rules: pricing.rules, promotions: active, now } };
}

// ---------------------------------------------------------------- products

/** Server-side only: `input` holds the purchase price (D-16). */
export type PricedProduct = { product: Product; pricing: PriceOutcome; input: PriceInput };

function mapAll(records: SupplierRecord[], locale: Locale, context: PricingContext): PricedProduct[] {
  const entries: PricedProduct[] = [];
  for (const r of records) {
    const res = toProduct(locale, r, context);
    if (res.product) entries.push({ product: res.product, pricing: res.pricing, input: res.priceInput });
  }
  return entries;
}

let mockSupplier: SupplierRecord[] | null = null;
const priced = new Map<Locale, { key: string; entries: PricedProduct[] }>();

let version: { value: number | null; checkedAt: number } | null = null;
/** The supplier records per catalog version: one load per version, shared by every request that arrives meanwhile. */
let dbRecords: { version: number | null; records: Promise<SupplierRecord[]> } | null = null;
/** The last copy that loaded: shown while the database is out of reach. */
let lastGood: { version: number | null; records: SupplierRecord[] } | null = null;

async function databaseRecords(): Promise<{ version: number | null; records: SupplierRecord[] }> {
  try {
    if (!version || Date.now() - version.checkedAt > VERSION_CHECK_MS) version = { value: await catalogVersion(), checkedAt: Date.now() };
    const current = version.value;
    if (!dbRecords || dbRecords.version !== current) {
      const entry = { version: current, records: current === null ? Promise.resolve([]) : loadDatabaseRecords() };
      dbRecords = entry;
      entry.records.catch(() => {
        if (dbRecords === entry) dbRecords = null;
      });
    }
    const records = await dbRecords.records;
    lastGood = { version: current, records };
    return lastGood;
  } catch {
    // docs/SUPPLIER_RESILIENCE.md: the database briefly out of reach — keep
    // showing the copy we had; without one, an honest "not now".
    version = null;
    if (lastGood) return lastGood;
    throw new SupplierUnavailableError();
  }
}

async function catalogEntries(locale: Locale): Promise<PricedProduct[]> {
  if (mockScenario() === "unavailable") throw new SupplierUnavailableError();
  const { key: pricingKey, context } = await pricingNow();
  const base = source === "database" ? await databaseRecords() : { version: "mock", records: (mockSupplier ??= mockRecords()) };
  const key = `${base.version}|${pricingKey}`;
  const cached = priced.get(locale);
  if (cached?.key === key) return cached.entries;
  const entries = mapAll(base.records, locale, context);
  priced.set(locale, { key, entries });
  return entries;
}

/** Every product that passes the selection rule (D-02), priced by the rule (D-03), in one language. */
export async function getCatalog(locale: Locale): Promise<Product[]> {
  return (await catalogEntries(locale)).map((e) => e.product);
}

/**
 * For the price screens in the panel: each product with how its price came
 * about — the rule, the floor, a promotion the floor limited or blocked
 * (docs/PRIJZEN.md § 2: the panel says where the floor stepped in).
 */
export async function getPricedCatalog(locale: Locale): Promise<PricedProduct[]> {
  return catalogEntries(locale);
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
