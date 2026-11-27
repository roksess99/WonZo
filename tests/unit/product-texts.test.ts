// The shop's own product introduction (user 2026-11-27): what the form
// accepts, and who may save it. The saving itself runs against the test
// database (tests/integration/product-texts.test.ts).

import { describe, expect, it, vi } from "vitest";

// No admin session and no local way in: the action must refuse before it reads anything.
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }), cookies: async () => ({ get: () => undefined }) }));

import { saveProductTextsAction } from "@/app/beheer/productteksten/actions";
import { can } from "@/lib/admin/permissions";
import { INTRO_MAX, isProductId, parseIntro } from "@/lib/catalog/texts";

describe("what the form accepts", () => {
  it("trims, keeps one blank line between paragraphs, and allows empty (no introduction)", () => {
    expect(parseIntro("  Een kast.  ")).toBe("Een kast.");
    expect(parseIntro("Eén.\r\n\r\n\r\n\r\nTwee.\t\tdrie")).toBe("Eén.\n\nTwee. drie");
    expect(parseIntro("")).toBe("");
  });

  it("refuses more than the column holds, counted in characters, and control characters", () => {
    expect(parseIntro("é".repeat(INTRO_MAX))).toHaveLength(INTRO_MAX);
    expect(parseIntro("a".repeat(INTRO_MAX + 1))).toBeUndefined();
    expect(parseIntro("tekst\u0000")).toBeUndefined();
    expect(parseIntro(null)).toBeUndefined();
  });

  it("only catalogue ids", () => {
    expect(isProductId("39391")).toBe(true);
    for (const bad of ["", "39391 OR 1=1", "-1", "1".repeat(13), null]) expect(isProductId(bad)).toBe(false);
  });
});

describe("who may write product texts", () => {
  it("only the owner's role for now (D-07: marketing is promotions, reviews, statistics)", () => {
    expect(can("eigenaar", "productteksten")).toBe(true);
    expect(can("marketing", "productteksten")).toBe(false);
    expect(can("boekhouder", "productteksten")).toBe(false);
  });

  it("the action refuses without an admin, before anything is read (no database here)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const form = new FormData();
    form.set("productId", "39391");
    form.set("version", "0");
    form.set("nl", "Een tekst.");
    form.set("en", "A text.");
    expect(await saveProductTextsAction({ ok: null }, form)).toEqual({ ok: false, error: "access" });
    vi.unstubAllEnvs();
  });
});
