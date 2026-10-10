import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/cron/catalog/route";
import { parseCompliance, parseImages } from "@/lib/catalog/bigbuy/dto";
import { toProduct } from "@/lib/catalog/bigbuy/map";
import { centsToDecimal, taxonomyPathOf, toSupplierRecord, type CatalogRows } from "@/lib/catalog/bigbuy/records";
import { assortmentGroups } from "@/lib/catalog/bigbuy/sync";
import * as fixtures from "@/lib/catalog/fixtures";
import { catalogSource, getProduct } from "@/lib/catalog/provider";
import { decide, nextStep, withinLimit, type ProgressRow } from "@/lib/catalog/sync/schedule";
import { fromDecimal } from "@/lib/money";

const tree = new Map(fixtures.taxonomies.map((t) => [t.id, { name: t.name, parent: t.parentTaxonomy }]));

/** The rows the refresh would write for a fixture product — the database form of the mock. */
function rowsFor(id: number): CatalogRows {
  const p = fixtures.products.find((x) => x.id === id)!;
  const s = fixtures.stock.find((x) => x.id === id)!;
  const shipping = fixtures.lowestShipping.find((x) => x.reference === p.sku) ?? null;
  const compliance = fixtures.compliance.find((x) => x.id === id) ?? null;
  return {
    product: {
      product_id: p.id, sku: p.sku, ean: p.ean13, manufacturer_id: p.manufacturer, taxonomy_id: p.taxonomy,
      cost_cents: fromDecimal(p.wholesalePrice).amount, advised_cents: fromDecimal(p.retailPrice).amount, tax_rate: "21.00",
      condition_code: p.condition, active: p.active, hs_code: p.intrastat, added_at: p.dateAdd,
      width: "1.00", height: "1.00", depth: "1.00", weight: "1.000",
    },
    texts: (["nl", "en"] as const).map((locale) => {
      const i = fixtures.information[locale].find((x) => x.id === id)!;
      return { product_id: id, locale, name: i.name, description: i.description };
    }),
    stock: s.stocks.map((r) => ({ product_id: id, warehouse: r.warehouse, min_days: r.minHandlingDays, max_days: r.maxHandlingDays, quantity: r.quantity })),
    images: (fixtures.images.find((x) => x.id === id)?.images ?? []).map((i) => ({ product_id: id, image_id: i.id, position: i.position, is_cover: i.isCover ? 1 : 0, url: i.url })),
    // As the database returns a JSON column: text.
    safety: compliance ? { product_id: id, http_status: 200, regulations: JSON.stringify(compliance.generalProductSafetyRegulations) } : null,
    shipping: shipping ? { sku: shipping.reference, cost_cents: fromDecimal(shipping.cost).amount, carrier: shipping.carrierName } : null,
    taxonomyPath: taxonomyPathOf(p.taxonomy, tree),
    brand: fixtures.manufacturers.find((m) => m.id === p.manufacturer)?.name ?? null,
  };
}

describe("database rows → the same Product as the mock (one mapping, D-31)", () => {
  it.each([1300118, 1300113, 1300104, 1300110])("product %i", async (id) => {
    for (const locale of ["nl", "en"] as const) {
      const fromDb = toProduct(locale, toSupplierRecord(rowsFor(id))).product;
      expect(fromDb).toEqual(await getProduct(locale, String(id)));
    }
  });

  it("refuses the same products as the mock does", () => {
    // S7910777 knife (D-36), S0800417 no GPSR, S2702120 no shipping cost
    for (const id of [1300111, 1300125, 1300129]) expect(toProduct("nl", toSupplierRecord(rowsFor(id))).product).toBeNull();
  });

  it("converts cents back to the exact decimal", () => {
    expect(centsToDecimal(1822)).toBe("18.22");
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal("100")).toBe("1.00");
    expect(() => centsToDecimal(-1)).toThrow();
    expect(() => centsToDecimal(1.5)).toThrow();
  });
});

describe("supplier data at the edge", () => {
  it("keeps only photos from the one allowed host", () => {
    const parsed = parseImages({
      id: 1,
      images: [
        { id: 1, isCover: true, url: "https://cdnbigbuy.com/images/a.jpg", position: 0 },
        { id: 2, isCover: false, url: "https://evil.example/b.jpg", position: 1 },
        { id: 3, isCover: false, url: "http://cdnbigbuy.com/c.jpg", position: 2 },
        { id: 4, isCover: false, url: "https://cdnbigbuy.com.evil.example/d.jpg", position: 3 },
      ],
    });
    expect(parsed?.images.map((i) => i.id)).toEqual([1]);
  });

  it("reads GPSR answers, also an empty one", () => {
    expect(parseCompliance(1, "S1", { generalProductSafetyRegulations: [{ name: "Maker", address: "Straat 1", safetyWarnings: ["Let op"] }] })?.generalProductSafetyRegulations[0])
      .toMatchObject({ name: "Maker", address: "Straat 1", countryIsoCode: null, safetyWarnings: ["Let op"] });
    expect(parseCompliance(1, "S1", { generalProductSafetyRegulations: [] })?.generalProductSafetyRegulations).toEqual([]);
  });

  it("turns BigBuy's warning objects into text, also for rows stored before the fix", () => {
    // As the real API answers (GEMETEN 2026-10-08).
    const regulations = [{
      name: "Maker", address: "Straat 1",
      safetyWarnings: [
        { id: 112874, name: "Niet rechtstreeks op de vlam gebruiken", isoCode: "nl", safetyWarningGroup: { id: 17, name: "Belangrijke informatie", isoCode: "nl" } },
        { id: 1, name: "Zonder groep" },
        { id: 2 },
      ],
    }];
    const expected = ["Belangrijke informatie: Niet rechtstreeks op de vlam gebruiken", "Zonder groep"];
    expect(parseCompliance(1, "S1", { generalProductSafetyRegulations: regulations })?.generalProductSafetyRegulations[0]?.safetyWarnings).toEqual(expected);
    const rows = rowsFor(1300118);
    rows.safety = { product_id: 1300118, http_status: 200, regulations: JSON.stringify(regulations) };
    expect(toProduct("nl", toSupplierRecord(rows)).product?.safety.warnings).toEqual(expected);
  });

  it("writes dimensions in the notation of the page", () => {
    const rows = rowsFor(1300118);
    rows.product = { ...rows.product, width: "1.00", height: "59.10", depth: "23.50" };
    const dims = (locale: "nl" | "en") => toProduct(locale, toSupplierRecord(rows)).product?.specs.find((s) => s.label === "dimensions")?.value;
    expect(dims("nl")).toBe("1 × 59,1 × 23,5 cm");
    expect(dims("en")).toBe("1 × 59.1 × 23.5 cm");
  });

  it("finds the assortment's groups by name, not by a hard-coded id", () => {
    expect(assortmentGroups(tree)).toEqual([19656, 19661, 19666, 19756]);
  });
});

describe("schedule (D-31): full at night, stock every 2 hours", () => {
  const at = (iso: string) => new Date(iso);
  const nightNl = at("2026-10-07T01:30:00Z"); // 03:30 in Amsterdam
  const dayNl = at("2026-10-07T12:00:00Z");

  it("starts a full run when there has never been one", () => {
    expect(decide({ now: dayNl, running: null, lastFullOk: null, lastAnyOk: null })).toEqual({ action: "start", kind: "full" });
  });

  it("does the full run at night, stock in between", () => {
    const lastNight = at("2026-10-06T02:00:00Z"); // 23.5 hours before nightNl
    const thisMorning = at("2026-10-07T03:00:00Z"); // 9 hours before dayNl
    expect(decide({ now: nightNl, running: null, lastFullOk: lastNight, lastAnyOk: at("2026-10-07T00:30:00Z") })).toEqual({ action: "start", kind: "full" });
    expect(decide({ now: dayNl, running: null, lastFullOk: thisMorning, lastAnyOk: at("2026-10-07T09:00:00Z") })).toEqual({ action: "start", kind: "stock" });
    expect(decide({ now: dayNl, running: null, lastFullOk: thisMorning, lastAnyOk: at("2026-10-07T11:00:00Z") })).toEqual({ action: "idle" });
  });

  it("does not wait for the night after a missed one", () => {
    expect(decide({ now: dayNl, running: null, lastFullOk: at("2026-10-06T05:00:00Z"), lastAnyOk: dayNl }).action).toBe("start");
  });

  it("continues a run, and gives up on one that is stuck", () => {
    const running = { id: 7, kind: "full" as const, startedAt: at("2026-10-07T10:00:00Z") };
    expect(decide({ now: dayNl, running, lastFullOk: null, lastAnyOk: null })).toEqual({ action: "continue", runId: 7, kind: "full" });
    expect(decide({ now: at("2026-10-07T23:00:00Z"), running, lastFullOk: null, lastAnyOk: null })).toMatchObject({ action: "abandon-and-start", abandonId: 7 });
  });

  it("works phase by phase, and shares a phase between endpoints with room", () => {
    const done = (step: ProgressRow["step"]): ProgressRow => ({ step, group: 0, done: true });
    const all = () => true;
    expect(nextStep("full", [], all)).toEqual({ step: "taxonomies" });
    // Manufacturers do not hold up the products (they took an hour on the first run).
    const manufacturersOpen = { step: "manufacturers" as const, group: 0, done: false };
    expect(nextStep("full", [done("taxonomies"), manufacturersOpen], (e) => e !== "manufacturers")).toEqual({ step: "products" });
    const afterProducts = [done("taxonomies"), manufacturersOpen, { step: "products" as const, group: 19656, done: true }];
    expect(nextStep("full", afterProducts, (e) => e !== "productsimages")).toEqual({ step: "stock" });
    expect(nextStep("full", afterProducts, () => false)).toEqual({ step: null, waiting: ["images", "stock", "info-nl", "info-en", "shipping", "manufacturers"] });
    expect(nextStep("stock", [done("stock"), done("evaluate")], all)).toEqual({ step: null, waiting: [] });
  });

  it("stays one call below the documented limits", () => {
    expect(withinLimit("products", 8)).toBe(true);
    expect(withinLimit("products", 9)).toBe(false);
    expect(() => withinLimit("order/create", 0)).toThrow();
  });
});

describe("CATALOG_SOURCE — checked at start-up", () => {
  it("defaults to the mock and refuses anything else", () => {
    expect(catalogSource({}, false)).toBe("mock");
    expect(catalogSource({ CATALOG_SOURCE: "database" }, true)).toBe("database");
    expect(() => catalogSource({ CATALOG_SOURCE: "bigbuy" }, true)).toThrow(/must be "mock" or "database"/);
    expect(() => catalogSource({ CATALOG_SOURCE: "database" }, false)).toThrow(/needs the DATABASE_\* settings/);
  });
});

describe("POST /api/cron/catalog", () => {
  const call = (token?: string) => POST(new Request("http://localhost/api/cron/catalog", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} }));
  afterEach(() => {
    delete process.env.JOB_TOKEN;
  });

  it("does not exist without JOB_TOKEN", async () => {
    expect((await call("x".repeat(40))).status).toBe(404);
  });

  it("refuses a missing or wrong token", async () => {
    process.env.JOB_TOKEN = "a".repeat(64);
    expect((await call()).status).toBe(401);
    expect((await call("b".repeat(64))).status).toBe(401);
  });

  it("with the right token, says what is missing instead of failing", async () => {
    process.env.JOB_TOKEN = "a".repeat(64);
    const res = await call("a".repeat(64));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "not-configured" });
  });
});
