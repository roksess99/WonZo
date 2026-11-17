// The legal texts and the shop's own statistics without a database (D-10,
// D-32, owner 2026-10-15).

import { describe, expect, it } from "vitest";
import { POST as statsRoute } from "@/app/api/stats/route";
import { legalValues } from "@/components/legal/LegalPage";
import { getLegal } from "@/lib/i18n/legal";
import { localizePath, resolvePublicPath } from "@/lib/i18n/paths";
import { amsterdamDay, countedPath } from "@/lib/stats";

describe("what is counted (no personal data, never the key of a status link)", () => {
  it("shop pages, without query or trailing slash", () => {
    expect(countedPath("/tuin/parasols?sort=prijs")).toBe("/tuin/parasols");
    expect(countedPath("/en/garden/")).toBe("/en/garden");
    expect(countedPath("/")).toBe("/");
  });
  it("a status page without its key — in every form the path can take", () => {
    const key = "a".repeat(43);
    expect(countedPath(`/bestelling/${key}`)).toBe("/bestelling/…");
    expect(countedPath(`/en/order/${key}`)).toBe("/en/order/…");
    expect(countedPath(`/nl/bestelling/${key}`)).toBe("/nl/bestelling/…");
  });
  it("never the panel, the API or anything that is not a plain path", () => {
    for (const bad of ["/beheer", "/beheer/bestellingen/1", "/api/stats", "/_next/x", "tuin", "/a b", "/<script>", 42, null, "/" + "x".repeat(400)]) expect(countedPath(bad)).toBeNull();
  });
  it("the day in the Netherlands: 23:30 UTC in summer is already the next day", () => {
    expect(amsterdamDay(new Date("2026-10-14T23:30:00Z"))).toBe("2026-10-15");
    expect(amsterdamDay(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
  });
  it("the route answers 204 and stores nothing without a database", async () => {
    const res = await statsRoute(new Request("http://localhost:3000/api/stats", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify({ path: "/" }) }));
    expect(res.status).toBe(204);
  });
});

describe("the legal pages (D-32: Dutch and English, Dutch decisive)", () => {
  it("both languages have the same sections, and every placeholder is filled from the company details", () => {
    const nl = getLegal("nl");
    const en = getLegal("en");
    expect(en.terms.sections.map((s) => s.body.length)).toEqual(nl.terms.sections.map((s) => s.body.length));
    expect(en.privacy.sections.map((s) => s.body.length)).toEqual(nl.privacy.sections.map((s) => s.body.length));
    const values = legalValues("nl");
    const all = JSON.stringify(nl) + JSON.stringify(en);
    for (const [, name] of all.matchAll(/\{(\w+)\}/g)) expect(["date", "open", ...Object.keys(values)]).toContain(name);
    expect(values).toMatchObject({ kvk: "42126738", vat: "NL005516835B45", email: "info@wonzo.nl" });
  });
  it("each page has its address in both languages", () => {
    expect(localizePath("en", "/algemene-voorwaarden")).toBe("/en/terms");
    expect(localizePath("en", "/herroepingsformulier")).toBe("/en/withdrawal-form");
    expect(resolvePublicPath("/en/withdrawal-form")).toEqual({ kind: "rewrite", locale: "en", internalPath: "/en/herroepingsformulier" });
    expect(resolvePublicPath("/privacy")).toEqual({ kind: "rewrite", locale: "nl", internalPath: "/nl/privacy" });
  });
});
