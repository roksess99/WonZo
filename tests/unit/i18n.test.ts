import { describe, expect, it } from "vitest";
import { localizePath, resolvePublicPath } from "@/lib/i18n/paths";

describe("localizePath — public URL for an internal route (D-32)", () => {
  it("Dutch has no prefix, English lives under /en with English words", () => {
    expect(localizePath("nl", "/")).toBe("/");
    expect(localizePath("nl", "/zoeken")).toBe("/zoeken");
    expect(localizePath("en", "/")).toBe("/en");
    expect(localizePath("en", "/zoeken")).toBe("/en/search");
    expect(localizePath("en", "/zo-werkt-wonzo")).toBe("/en/how-wonzo-works");
    expect(localizePath("en", "/garden/watering")).toBe("/en/garden/watering");
  });
});

describe("resolvePublicPath — what the proxy does", () => {
  it("rewrites Dutch URLs onto /nl", () => {
    expect(resolvePublicPath("/")).toEqual({ kind: "rewrite", locale: "nl", internalPath: "/nl" });
    expect(resolvePublicPath("/tuin/bewatering")).toEqual({ kind: "rewrite", locale: "nl", internalPath: "/nl/tuin/bewatering" });
  });
  it("maps English words to the internal Dutch routes", () => {
    expect(resolvePublicPath("/en/search")).toEqual({ kind: "rewrite", locale: "en", internalPath: "/en/zoeken" });
    expect(resolvePublicPath("/en")).toEqual({ kind: "rewrite", locale: "en", internalPath: "/en" });
    expect(resolvePublicPath("/en/garden")).toEqual({ kind: "rewrite", locale: "en", internalPath: "/en/garden" });
  });
  it("redirects the non-canonical /nl prefix", () => {
    expect(resolvePublicPath("/nl/tuin")).toEqual({ kind: "redirect", to: "/tuin" });
    expect(resolvePublicPath("/nl")).toEqual({ kind: "redirect", to: "/" });
  });
  it("redirects a Dutch word under /en to the English one, and leaves shared words alone", () => {
    expect(resolvePublicPath("/en/winkelwagen")).toEqual({ kind: "redirect", to: "/en/cart" });
    expect(resolvePublicPath("/en/zoeken")).toEqual({ kind: "redirect", to: "/en/search" });
    expect(resolvePublicPath("/en/cart")).toEqual({ kind: "rewrite", locale: "en", internalPath: "/en/winkelwagen" });
    expect(resolvePublicPath("/en/contact")).toEqual({ kind: "rewrite", locale: "en", internalPath: "/en/contact" });
    expect(resolvePublicPath("/en/product/x-1")).toEqual({ kind: "rewrite", locale: "en", internalPath: "/en/product/x-1" });
  });
});
