import { describe, expect, it } from "vitest";
import { assortment } from "@/lib/catalog/assortment";
import { locales } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { DEFAULT_SHARE_IMAGE, isWwwOf, metaDescription, pageMetadata, parseSiteUrl, shareImageUrl } from "@/lib/seo";
import { breadcrumbJsonLd, websiteJsonLd } from "@/lib/structured-data";

describe("parseSiteUrl — NEXT_PUBLIC_SITE_URL checked at start-up", () => {
  it("accepts a full address, with or without a trailing slash", () => {
    expect(parseSiteUrl("https://wonzo.nl", "production").href).toBe("https://wonzo.nl/");
    expect(parseSiteUrl("https://wonzo.nl/", "production").href).toBe("https://wonzo.nl/");
    expect(parseSiteUrl("http://localhost:3000", "development").href).toBe("http://localhost:3000/");
  });

  it("refuses the value that broke the first Hostinger build, with a clear message", () => {
    expect(() => parseSiteUrl("wonzo.nl", "production")).toThrow(/must be a full address with https:\/\/.*got "wonzo\.nl"/);
  });

  it("refuses other protocols and paths", () => {
    expect(() => parseSiteUrl("ftp://wonzo.nl", "production")).toThrow(/must be a full address/);
    expect(() => parseSiteUrl("https://wonzo.nl/winkel", "production")).toThrow(/without a path/);
  });

  it("falls back to localhost only outside production", () => {
    expect(parseSiteUrl(undefined, "development").href).toBe("http://localhost:3000/");
    expect(parseSiteUrl("", "test").href).toBe("http://localhost:3000/");
    expect(() => parseSiteUrl(undefined, "production")).toThrow(/not set/);
  });
});

describe("metaDescription — price and delivery first, then what fits", () => {
  const lead = "€ 11,89 · bezorgd in 3–6 werkdagen.";

  it("keeps a short text whole", () => {
    expect(metaDescription(lead, "Een spaarpot.")).toBe(`${lead} Een spaarpot.`);
  });

  it("cuts a long supplier text at a word, with an ellipsis, within the limit", () => {
    const long = "Als u gepassioneerd bent over de wereld van de gadgets, dan biedt InnovaGoods u de beste en meest originele nieuwe artikelen voor het huis, auto, reizen, kinderen.";
    const out = metaDescription(lead, long);
    expect(out.length).toBeLessThanOrEqual(155);
    expect(out.startsWith(lead)).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    expect(long).toContain(out.slice(lead.length + 1, -1));
  });

  it("collapses whitespace and works without a text", () => {
    expect(metaDescription(lead, "  twee\n\nregels ")).toBe(`${lead} twee regels`);
    expect(metaDescription(lead, "")).toBe(lead);
  });
});

describe("pageMetadata — a picture for every shared link", () => {
  const paths = { nl: "/wonen", en: "/en/home" };

  it("falls back to the square mark with the small card", () => {
    const meta = pageMetadata("nl", paths, "Wonen", "Opbergen.");
    expect(meta.openGraph?.images).toEqual([{ ...DEFAULT_SHARE_IMAGE, alt: "Wonen" }]);
    expect(meta.twitter).toMatchObject({ card: "summary", images: [DEFAULT_SHARE_IMAGE.url] });
  });

  it("uses a page's own picture with the large card", () => {
    const meta = pageMetadata("en", paths, "Kast", "Een kast.", { url: shareImageUrl("https://cdnbigbuy.com/images/a b.jpg"), alt: "Kast" });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", images: ["/_next/image?url=https%3A%2F%2Fcdnbigbuy.com%2Fimages%2Fa%20b.jpg&w=1200&q=75"] });
    expect(meta.alternates?.canonical).toBe("/en/home");
  });
});

describe("isWwwOf — one host for the shop", () => {
  const site = new URL("https://wonzo.nl");

  it("recognises the www variant, also with a port or capitals", () => {
    expect(isWwwOf("www.wonzo.nl", site)).toBe(true);
    expect(isWwwOf("WWW.Wonzo.nl:443", site)).toBe(true);
  });

  it("leaves the shop's own host and anything else alone", () => {
    expect(isWwwOf("wonzo.nl", site)).toBe(false);
    expect(isWwwOf("www.wonzo.nl.evil.example", site)).toBe(false);
    expect(isWwwOf("localhost:3000", site)).toBe(false);
    expect(isWwwOf(null, site)).toBe(false);
  });
});

describe("breadcrumb and website markup", () => {
  const base = new URL("https://wonzo.nl");

  it("lists the visible breadcrumb in order, the page itself without a link", () => {
    const data = breadcrumbJsonLd([{ href: "/", label: "WonZo" }, { href: "/wonen", label: "Wonen" }, { label: "Meubels" }], base);
    expect(data.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "WonZo", item: "https://wonzo.nl/" },
      { "@type": "ListItem", position: 2, name: "Wonen", item: "https://wonzo.nl/wonen" },
      { "@type": "ListItem", position: 3, name: "Meubels" },
    ]);
  });

  it("names the site per language, published by the shop", () => {
    expect(websiteJsonLd(base, "/en", "WonZo", "Things.", "en-GB")).toMatchObject({
      "@id": "https://wonzo.nl/en/#website",
      url: "https://wonzo.nl/en",
      inLanguage: "en-GB",
      publisher: { "@id": "https://wonzo.nl/#organization" },
    });
    expect(websiteJsonLd(base, "/", "WonZo", "Spullen.", "nl-NL")["@id"]).toBe("https://wonzo.nl/#website");
  });
});

describe("category texts", () => {
  it("every subcategory has its own intro, in both languages, different from its category's", () => {
    for (const locale of locales) {
      const m = getMessages(locale);
      for (const c of assortment) {
        for (const s of c.subcategories) {
          const intro = m.subcategoryIntros[s.key as keyof typeof m.subcategoryIntros];
          expect(intro, `${locale} ${s.key}`).toBeTruthy();
          expect(intro).not.toBe(m.categories[c.key as keyof typeof m.categories].intro);
        }
      }
    }
  });
});
