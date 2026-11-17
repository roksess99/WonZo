import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { maxDiscountBp, NO_RULES, priceProduct, type PriceInput, type PriceRules, type Promotion } from "@/lib/pricing/rules";

const now = new Date("2026-11-02T12:00:00Z");
const input = (over: Partial<PriceInput> = {}): PriceInput => ({
  productId: "1300106",
  categoryKey: "wonen",
  subcategoryKey: "opslag",
  costExcl: money(1000),
  advisedExcl: money(2479),
  vatRateBp: 2100,
  ...over,
});
const rules = (over: Partial<PriceRules> = {}): PriceRules => ({ ...NO_RULES, ...over });
const promo = (over: Partial<Promotion> = {}): Promotion => ({
  id: "1",
  name: "Najaar",
  target: { kind: "category", key: "wonen" },
  percentBp: 2000,
  startsAt: new Date("2026-11-01T00:00:00Z"),
  endsAt: new Date("2026-11-08T00:00:00Z"),
  ...over,
});

describe("the price rule (D-03)", () => {
  it("without a rule: the advised price plus VAT", () => {
    // By hand: € 24,79 × 1,21 = € 29,9959 → € 30,00.
    expect(priceProduct(input(), NO_RULES, [], now)).toMatchObject({ basis: "advised", listPrice: money(3000), price: money(3000), promotion: null });
  });

  it("a default markup on the purchase price, and a subcategory that overrides it", () => {
    // By hand: € 10,00 + 40 % = € 14,00 × 1,21 = € 16,94; opslag at 10 %: € 11,00 × 1,21 = € 13,31.
    expect(priceProduct(input(), rules({ defaultMarkupBp: 4000 }), [], now).listPrice).toEqual(money(1694));
    expect(priceProduct(input(), rules({ defaultMarkupBp: 4000, markups: new Map([["wonen/opslag", 1000]]) }), [], now).listPrice).toEqual(money(1331));
    expect(priceProduct(input({ subcategoryKey: "meubels" }), rules({ defaultMarkupBp: 4000, markups: new Map([["wonen/opslag", 1000]]) }), [], now).listPrice).toEqual(money(1694));
  });

  it("never below the floor: purchase plus payment costs plus VAT (D-16)", () => {
    // By hand: (€ 10,00 + € 0,50) × 1,21 = € 12,705 → € 12,71; a 0 % markup gives € 12,10, lifted to the floor.
    const r = priceProduct(input(), rules({ defaultMarkupBp: 0, paymentCostCents: 50 }), [], now);
    expect(r).toMatchObject({ floor: money(1271), listPrice: money(1271), raisedToFloor: true });
    // The advised price below the floor is lifted too.
    expect(priceProduct(input({ advisedExcl: money(900) }), rules({ paymentCostCents: 50 }), [], now)).toMatchObject({ basis: "advised", listPrice: money(1271), raisedToFloor: true });
  });
});

describe("promotions (D-08)", () => {
  it("the floor goes before the percentage: 20 % on a 10 % markup gives 9 % (docs/PRIJZEN.md § 2)", () => {
    // By hand: list € 13,31, floor € 12,10; 20 % asks € 10,648 → € 10,65, below the floor → € 12,10 = 9,09 % → shown 9 %.
    const r = priceProduct(input(), rules({ defaultMarkupBp: 1000 }), [promo()], now);
    expect(r).toMatchObject({ listPrice: money(1331), price: money(1210), promotion: { id: "1", requestedBp: 2000, shownPercent: 9, limited: true } });
  });

  it("applies the full percentage where the margin allows it", () => {
    // By hand: list € 16,94 (40 %); 20 % → € 13,552 → € 13,55, above the floor € 12,10; shown 20 %.
    const r = priceProduct(input(), rules({ defaultMarkupBp: 4000 }), [promo()], now);
    expect(r).toMatchObject({ price: money(1355), promotion: { shownPercent: 20, limited: false } });
  });

  it("the highest wins, never stacked; product, subcategory and category all match", () => {
    const all = [promo({ id: "1", percentBp: 1000 }), promo({ id: "2", percentBp: 1500, target: { kind: "subcategory", key: "wonen/opslag" } }), promo({ id: "3", percentBp: 500, target: { kind: "product", key: "1300106" } })];
    // By hand: 15 % of € 16,94 = € 14,399 → € 14,40.
    expect(priceProduct(input(), rules({ defaultMarkupBp: 4000 }), all, now)).toMatchObject({ price: money(1440), promotion: { id: "2" } });
    expect(priceProduct(input({ productId: "9" }), rules({ defaultMarkupBp: 4000 }), [promo({ target: { kind: "product", key: "1300106" } })], now).promotion).toBeNull();
  });

  it("only between start and end: the end itself is over", () => {
    expect(priceProduct(input(), rules({ defaultMarkupBp: 4000 }), [promo({ startsAt: new Date("2026-11-03T00:00:00Z") })], now).promotion).toBeNull();
    expect(priceProduct(input(), rules({ defaultMarkupBp: 4000 }), [promo({ endsAt: now })], now).promotion).toBeNull();
  });

  it("a promotion with no room at all is reported, not shown", () => {
    const r = priceProduct(input(), rules({ defaultMarkupBp: 0 }), [promo()], now);
    expect(r).toMatchObject({ price: money(1210), promotion: null, blockedPromotion: { id: "1", requestedBp: 2000 } });
  });
});

describe("the room a markup leaves", () => {
  it.each([
    [1000, 909],
    [1500, 1304],
    [2000, 1666],
    [2500, 2000],
    [4000, 2857],
    [10000, 5000],
  ])("markup %i bp → at most %i bp off (docs/PRIJZEN.md § 2)", (markup, max) => {
    expect(maxDiscountBp(markup)).toBe(max);
  });
});
