import { describe, expect, it } from "vitest";
import { parseSiteUrl } from "@/lib/seo";

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
