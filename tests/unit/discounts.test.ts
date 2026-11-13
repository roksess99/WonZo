// The price and discount screens without a database: what the forms accept,
// Dutch time in the date fields, and who may save (D-03, D-07, D-08).

import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }), cookies: async () => ({ get: () => undefined }) }));

import { createPromotionAction, stopPromotionAction } from "@/app/beheer/kortingen/actions";
import { savePriceRulesAction } from "@/app/beheer/prijzen/actions";
import { can } from "@/lib/admin/permissions";
import { amsterdamLocalToInstant, instantToAmsterdamLocal } from "@/lib/dates";
import { checkTarget, RULE_KEYS } from "@/lib/discounts/store";
import { euroText, parseEuro, parsePercent, percentText } from "@/lib/pricing/input";

describe("what the forms accept", () => {
  it("a percentage with at most two decimals, comma or point; empty is no value", () => {
    expect(parsePercent("12")).toBe(1200);
    expect(parsePercent("12,5")).toBe(1250);
    expect(parsePercent("12.55 %")).toBe(1255);
    expect(parsePercent(" ")).toBeNull();
    for (const bad of ["-5", "12,555", "1e3", "twaalf", "12,"]) expect(parsePercent(bad)).toBeUndefined();
    expect(percentText(1250)).toBe("12,5");
    expect(percentText(null)).toBe("");
  });

  it("an amount in euro, exact to the cent", () => {
    expect(parseEuro("0,32")).toBe(32);
    expect(parseEuro("1.5")).toBe(150);
    expect(parseEuro("0")).toBe(0);
    for (const bad of ["-0,32", "0,321", "", "€ 1"]) expect(parseEuro(bad)).toBeUndefined();
    expect(euroText(32)).toBe("0,32");
  });

  it("a target the assortment knows", () => {
    expect(checkTarget("category", "wonen")).toEqual({ kind: "category", key: "wonen" });
    expect(checkTarget("subcategory", "wonen/opslag")).toEqual({ kind: "subcategory", key: "wonen/opslag" });
    expect(checkTarget("product", "1300106")).toEqual({ kind: "product", key: "1300106" });
    expect(checkTarget("category", "elektronica")).toBeNull();
    expect(checkTarget("subcategory", "opslag")).toBeNull();
    expect(checkTarget("product", "V0100546")).toBeNull();
    expect(checkTarget("all", "x")).toBeNull();
    expect(RULE_KEYS).toContain("sport/thuis-sporten");
  });
});

describe("Dutch time in the date fields", () => {
  it("winter and summer time, and back", () => {
    expect(amsterdamLocalToInstant("2026-11-03T09:00")?.toISOString()).toBe("2026-11-03T08:00:00.000Z");
    expect(amsterdamLocalToInstant("2026-07-01T09:00")?.toISOString()).toBe("2026-07-01T07:00:00.000Z");
    expect(instantToAmsterdamLocal(new Date("2026-11-03T08:00:00Z"))).toBe("2026-11-03T09:00");
    expect(amsterdamLocalToInstant("2026-02-30T09:00")).toBeNull();
    expect(amsterdamLocalToInstant("morgen")).toBeNull();
  });
});

describe("who may change prices and promotions", () => {
  it("prices stay with the owner; promotions are owner and marketing (D-07)", () => {
    expect(can("eigenaar", "prijzen")).toBe(true);
    expect(can("marketing", "prijzen")).toBe(false);
    expect(can("boekhouder", "prijzen")).toBe(false);
    expect(can("marketing", "kortingen")).toBe(true);
    expect(can("boekhouder", "kortingen")).toBe(false);
  });

  it("every action refuses without an admin, before anything is read (no database here)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const form = new FormData();
    form.set("version", "0");
    form.set("defaultMarkup", "40");
    form.set("paymentCost", "0,32");
    form.set("name", "Najaar");
    form.set("kind", "category");
    form.set("category", "wonen");
    form.set("percent", "20");
    form.set("promotionId", "1");
    expect(await savePriceRulesAction({ ok: null }, form)).toEqual({ ok: false, error: "access" });
    expect(await createPromotionAction({ ok: null }, form)).toEqual({ ok: false, error: "access" });
    expect(await stopPromotionAction({ ok: null }, form)).toEqual({ ok: false, error: "access" });
    vi.unstubAllEnvs();
  });
});
