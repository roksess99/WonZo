// Sitemap, structured data and llms.txt (GEO-analyse 2026-11-21): what search
// engines and AI systems read about the shop. Checked against the shop's own
// rules: the shipping of one piece (D-13), the 14-day window, the company.
//
// Shipping by hand (D-13): a € 10,00 item ships for € 5,95; a € 60,00 item
// ships free (≥ € 50); a large item (alone € 63,80 > € 15) costs € 63,80 per
// piece, also above € 50.

import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/catalog/types";
import { company } from "@/lib/company";
import { getMessages } from "@/lib/i18n/messages";
import { llmsText } from "@/lib/llms";
import { formatMoneyShort, money, toDecimalString } from "@/lib/money";
import { sitemapEntries, SITEMAP_PAGES } from "@/lib/sitemap";
import { jsonLd, organizationJsonLd, postalAddress, productJsonLd } from "@/lib/structured-data";

const base = new URL("https://wonzo.nl");

function product(id: string, slug: string, price: number, shippingAlone = 858): Product {
  return {
    id, source: "bigbuy", slug, name: `P ${id}`, brand: "InnovaGoods", sku: `S${id}`, ean: "8435527826338", price: money(price), promotion: null,
    vatRateBasisPoints: 2100, availability: "in_stock", stock: 5, offerId: `${id}-1`,
    delivery: { minWorkingDays: 3, maxWorkingDays: 6, shipsFrom: "ES" }, shippingAlone: money(shippingAlone), imageUrls: ["/mock/chair.svg"],
    categoryKey: "wonen", subcategoryKey: "opslag", specs: [], description: ["Een stoel.", "Inklapbaar."], safety: { manufacturer: null, warnings: [] }, addedAt: "2026-01-01",
  };
}

describe("amounts for machines", () => {
  it("two decimals from the cents, without floats", () => {
    expect(toDecimalString(money(595))).toBe("5.95");
    expect(toDecimalString(money(5000))).toBe("50.00");
    expect(toDecimalString(money(7))).toBe("0.07");
    expect(toDecimalString(money(0))).toBe("0.00");
  });
});

describe("the sitemap", () => {
  const entries = sitemapEntries(base, { nl: [product("1", "stoel-1", 1000)], en: [product("1", "chair-1", 1000), product("2", "only-en-2", 1000)] });
  const urls = entries.map((e) => e.url);

  it("lists the fixed pages and the categories in both languages, with the same pairs as hreflang", () => {
    expect(urls).toContain("https://wonzo.nl/");
    expect(urls).toContain("https://wonzo.nl/en");
    expect(urls).toContain("https://wonzo.nl/zo-werkt-wonzo");
    expect(urls).toContain("https://wonzo.nl/en/how-wonzo-works");
    expect(urls).toContain("https://wonzo.nl/wonen/opslag-en-organisatie");
    expect(urls).toContain("https://wonzo.nl/en/home/storage");
    const how = entries.find((e) => e.url === "https://wonzo.nl/en/how-wonzo-works");
    expect(how?.alternates?.languages).toEqual({ nl: "https://wonzo.nl/zo-werkt-wonzo", en: "https://wonzo.nl/en/how-wonzo-works", "x-default": "https://wonzo.nl/zo-werkt-wonzo" });
    expect(SITEMAP_PAGES.length * 2).toBeLessThan(entries.length);
  });

  it("a product with its slug per language; one in one language only stands alone", () => {
    expect(entries.find((e) => e.url === "https://wonzo.nl/product/stoel-1")?.alternates?.languages).toMatchObject({ en: "https://wonzo.nl/en/product/chair-1" });
    expect(entries.find((e) => e.url === "https://wonzo.nl/en/product/only-en-2")?.alternates?.languages).toEqual({ en: "https://wonzo.nl/en/product/only-en-2" });
  });

  it("never the private or noindex pages, never the admin panel or the API", () => {
    for (const bad of ["/winkelwagen", "/afrekenen", "/zoeken", "/bestelling", "/beoordelen/", "/beheer", "/api/", "/en/cart", "/en/checkout", "/en/search"]) {
      expect(urls.some((u) => new URL(u).pathname.startsWith(bad))).toBe(false);
    }
  });

  it("without a catalogue the pages and categories are still there", () => {
    expect(sitemapEntries(base, {}).length).toBeGreaterThan(SITEMAP_PAGES.length * 2);
  });
});

describe("structured data", () => {
  it("the company, from the company details", () => {
    const org = organizationJsonLd(base);
    expect(org).toMatchObject({
      "@type": "OnlineStore", name: "WonZo", legalName: company.legalName, email: company.email, vatID: company.vat,
      identifier: { propertyID: "KvK", value: company.kvk },
      address: { streetAddress: "Thaliastraat 267", postalCode: "6846 XX", addressLocality: "Arnhem", addressCountry: "NL" },
    });
    expect(postalAddress("ergens zonder postcode")).toBeNull();
  });

  it("a product: shipping of one piece by the shop's own rule, and the 14-day window", () => {
    const offer = (p: Product) => productJsonLd(p, "https://wonzo.nl/product/x", base).offers;
    expect(offer(product("1", "a", 1000)).shippingDetails.shippingRate).toMatchObject({ value: "5.95", currency: "EUR" });
    expect(offer(product("2", "b", 6000)).shippingDetails.shippingRate.value).toBe("0.00");
    expect(offer(product("3", "c", 6000, 6380)).shippingDetails.shippingRate.value).toBe("63.80");
    const o = offer(product("1", "a", 1999));
    expect(o.price).toBe("19.99");
    expect(o.shippingDetails.shippingDestination).toMatchObject({ addressCountry: "NL" });
    expect(o.hasMerchantReturnPolicy).toMatchObject({ merchantReturnDays: 14, applicableCountry: "NL" });
    // No stars without real reviews (D-12).
    expect(JSON.stringify(productJsonLd(product("1", "a", 1000), "u", base))).not.toContain("aggregateRating");
  });

  it("a name cannot close the script tag", () => {
    expect(jsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});

describe("llms.txt", () => {
  const text = llmsText(base, { nl: getMessages("nl"), en: getMessages("en") });

  it("says who sells and what shipping costs, with the same numbers as the shop", () => {
    expect(text.startsWith("# WonZo\n")).toBe(true);
    expect(text).toContain(`KvK ${company.kvk}`);
    // The shop's own notation (a non-breaking space after the euro sign), from the same formatter.
    expect(text).toContain(`gratis vanaf ${formatMoneyShort(money(5000))}`);
    expect(text).toContain(formatMoneyShort(money(595)));
    expect(text).toContain("14 dagen bedenktijd");
  });

  it("links the pages and categories in both languages, on the public address", () => {
    expect(text).toContain("(https://wonzo.nl/zo-werkt-wonzo)");
    expect(text).toContain("(https://wonzo.nl/en/how-wonzo-works)");
    expect(text).toContain("(https://wonzo.nl/tuin)");
    expect(text).toContain("(https://wonzo.nl/en/garden)");
    expect(text).not.toContain("localhost");
    expect(text).not.toContain("/beheer");
  });
});
