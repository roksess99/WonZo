import { describe, expect, it } from "vitest";
import { placeInAssortment } from "@/lib/catalog/assortment";
import { chooseOffer, deliveryFor } from "@/lib/catalog/delivery";
import { excludedByD36, hasElectricalName, legalClass } from "@/lib/catalog/legal-class";
import { getCatalog, getCatalogOrUnavailable, getProduct } from "@/lib/catalog/provider";
import { applyQuery, brandFacet, parseListingQuery, search } from "@/lib/catalog/query";
import { select } from "@/lib/catalog/selection";
import { htmlToParagraphs } from "@/lib/text";

describe("legalClass — customs code triage (docs/ONDERZOEK.md § 6)", () => {
  it.each([
    ["85171800", "zwaar"], // telephone, the first measured product
    ["73239300", "licht"], // stainless household article: food contact
    ["94036010", "basis"], // wooden furniture
    ["82055980", "basis"], // hand tool
    ["82119200", "licht"], // kitchen knife
    ["63026000", "licht"], // towel: textile
    ["95030099", "zwaar"], // toy
    ["94054099", "zwaar"], // lamp
    ["", "onbekend"],
  ])("%s → %s", (hs, weight) => {
    expect(legalClass(hs).weight).toBe(weight);
  });
});

describe("names and D-36 exclusions", () => {
  it("catches electrical items the customs code misses", () => {
    expect(hasElectricalName("Elektrische deken Elakef InnovaGoods 160 W")).toBe(true);
    expect(hasElectricalName("Kerstster met LED-lichten")).toBe(true);
    expect(hasElectricalName("Kledingorganizer voor 40 items")).toBe(false);
  });
  it("excludes what the owner excluded", () => {
    expect(excludedByD36("82119200", "Koksmes")).toBe("mes");
    expect(excludedByD36("73211110", "Gas stove")).toBe("gastoestel");
    expect(excludedByD36("94042100", "Matras")).toBe("matras of topper");
    expect(excludedByD36("73211900", "Houtskoolbarbecue")).toBeNull();
    expect(excludedByD36("94017900", "Messing kandelaar")).toBeNull(); // "messing" is not "messen"
  });
});

describe("placeInAssortment — by name, trimmed (D-02)", () => {
  it("matches the duplicate 'Keukengerei' and names with a trailing space", () => {
    expect(placeInAssortment(["Huis en koken", "Keukengerei", "Messen"])).toEqual({ categoryKey: "wonen", subcategoryKey: "keuken" });
    expect(placeInAssortment(["Sport en outdoor", "Kamperen en wandelen", "Slaapuitrusting voor kamperen "])).toEqual({
      categoryKey: "buitenleven",
      subcategoryKey: "kamperen",
    });
  });
  it("does not match a sibling or a parent", () => {
    expect(placeInAssortment(["Tuin", "Tuinieren", "Ongediertebestrijding en gewasbescherming"])).toBeNull();
    expect(placeInAssortment(["Tuin"])).toBeNull();
    expect(placeInAssortment(["Huis en koken", "Woningtextiel", "Beddengoed en kussens"])).toBeNull(); // later (D-36)
  });
});

describe("select — every rule of D-02", () => {
  const ok = {
    taxonomyPath: ["Tuin", "Tuinmeubelen en accessoires", "Ligstoelen"],
    hs: "94017900",
    names: ["Ligstoel", "Lounger"],
    condition: "NEW",
    active: true,
    stock: 3,
    hasManufacturer: true,
  };
  it("allows a compliant product", () => {
    expect(select(ok)).toEqual({ allowed: true, categoryKey: "tuin", subcategoryKey: "tuinmeubels" });
  });
  it.each([
    [{ condition: "REFURBISHED_B" }, "conditie REFURBISHED_B"],
    [{ stock: 0 }, "geen voorraad"],
    [{ hasManufacturer: false }, "geen GPSR-gegevens"],
    [{ hs: "85437090" }, "douanecode: zwaar"],
    [{ names: ["Ligstoel", "Heated lounger"] }, "elektrisch kenmerk in de naam"],
    [{ active: false }, "niet actief"],
  ])("refuses %o", (change, reason) => {
    const v = select({ ...ok, ...change });
    expect(v.allowed).toBe(false);
    if (!v.allowed) expect(v.reasons).toContain(reason);
  });
});

describe("offer and delivery (docs/api/LEVERANCIER.md § 7)", () => {
  it("takes stock and speed from the same row", () => {
    const row = chooseOffer([
      { quantity: 0, minHandlingDays: 0, maxHandlingDays: 1, warehouse: 1 },
      { quantity: 12, minHandlingDays: 1, maxHandlingDays: 2, warehouse: 1 },
    ]);
    expect(row?.quantity).toBe(12);
    expect(deliveryFor(row!)).toEqual({ minWorkingDays: 4, maxWorkingDays: 7, shipsFrom: "ES" });
  });
  it("has no offer without stock", () => {
    expect(chooseOffer([{ quantity: 0, minHandlingDays: 0, maxHandlingDays: 1, warehouse: 1 }])).toBeNull();
  });
});

describe("mock catalog through the real mapping", () => {
  it("keeps only allowed products, in both languages", async () => {
    const nl = await getCatalog("nl");
    const en = await getCatalog("en");
    expect(nl.map((p) => p.id).sort()).toEqual(en.map((p) => p.id).sort());
    const skus = nl.map((p) => p.sku);
    // Excluded on purpose in the fixtures:
    for (const sku of ["S3601455", "S7910777", "V0103915", "D1400967", "V0104000", "V0104099", "S0800417", "S7191227"]) {
      expect(skus).not.toContain(sku);
    }
    // Edge cases that must pass:
    expect(skus).toContain("D1401142"); // stock of 1
    expect(skus).toContain("V0104071"); // prices as strings
    expect(skus).toContain("S3042314"); // no image, long name
  });

  it("turns supplier HTML into plain text", async () => {
    const p = await getProduct("nl", "1300110");
    expect(p?.description.join(" ")).toBe("Schaaltjes met een koelvak eronder: vul het vak met ijs & serveer koel.");
    expect(htmlToParagraphs("Een<br>twee<p>drie</p>vier <script>x</script>")).toEqual(["Een\ntwee", "drie", "vier x"]);
  });

  it("hides placeholder dimensions (1 × 1 × 1)", async () => {
    const p = await getProduct("nl", "1300101");
    expect(p?.specs.find((s) => s.label === "dimensions")).toBeUndefined();
  });

  it("puts the id in the slug", async () => {
    const p = await getProduct("en", "1300113");
    expect(p?.slug).toBe("marbueno-summer-beach-umbrella-red-160-cm-1300113");
  });
});

describe("query", () => {
  it("searches without diacritics and requires every term", async () => {
    const nl = await getCatalog("nl");
    expect(search(nl, "parasol").map((p) => p.sku)).toEqual(["D1401142"]);
    expect(search(nl, "SLAAPZAK °c").map((p) => p.sku)).toEqual(["S6105001"]);
    expect(search(nl, "parasol tafel")).toEqual([]);
  });

  it("filters by brand and price and sorts deterministically", async () => {
    const nl = await getCatalog("nl");
    const list = applyQuery(nl, { brands: ["Trixie"], sort: "price-asc" });
    expect(list.every((p) => p.brand === "Trixie")).toBe(true);
    const prices = list.map((p) => p.price.amount);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(applyQuery(nl, { minPrice: 100 }).every((p) => p.price.amount >= 10000)).toBe(true);
    expect(brandFacet(nl).some((b) => b.brand === "InnovaGoods")).toBe(true);
  });

  it("reads URL params without trusting them", () => {
    expect(parseListingQuery({ sort: "drop table", min: "-5", max: "50", brand: ["A", "B"] })).toEqual({
      q: undefined,
      brands: ["A", "B"],
      minPrice: undefined,
      maxPrice: 50,
      sort: undefined,
    });
  });
});

describe("supplier unavailable (docs/SUPPLIER_RESILIENCE.md, CATALOG_MOCK_SCENARIO)", () => {
  it("gives an honest state instead of an error page", async () => {
    process.env.CATALOG_MOCK_SCENARIO = "unavailable";
    try {
      expect(await getCatalogOrUnavailable("nl")).toBeNull();
      await expect(getProduct("nl", "1300113")).rejects.toThrow("Supplier catalog unavailable");
    } finally {
      delete process.env.CATALOG_MOCK_SCENARIO;
    }
    expect((await getCatalogOrUnavailable("nl"))?.length).toBeGreaterThan(0);
  });
});
