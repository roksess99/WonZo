import { describe, expect, it } from "vitest";
import { add, formatMoney, formatMoneyShort, fromDecimal, money, MoneyError } from "@/lib/money";
import { sellingPrice } from "@/lib/pricing";

describe("fromDecimal — exact conversion to cents", () => {
  it("converts numbers and strings the supplier sends (GEMETEN 2026-10-05: numbers; documented: strings)", () => {
    expect(fromDecimal(18.22)).toEqual({ amount: 1822, currency: "EUR" });
    expect(fromDecimal("18.22")).toEqual({ amount: 1822, currency: "EUR" });
    expect(fromDecimal("18,2")).toEqual({ amount: 1820, currency: "EUR" });
    expect(fromDecimal(55)).toEqual({ amount: 5500, currency: "EUR" });
  });

  it("is exact where floating point is not", () => {
    // 1.15 * 100 === 114.99999999999999 in floating point.
    expect(1.15 * 100).not.toBe(115);
    expect(fromDecimal(1.15).amount).toBe(115);
    expect(fromDecimal(0.1).amount + fromDecimal(0.2).amount).toBe(30);
  });

  it("refuses what is not an amount instead of guessing", () => {
    expect(() => fromDecimal("18.225")).toThrow(MoneyError);
    expect(() => fromDecimal("abc")).toThrow(MoneyError);
    expect(() => fromDecimal(Number.NaN)).toThrow(MoneyError);
  });
});

describe("arithmetic", () => {
  it("refuses to mix currencies", () => {
    expect(() => add(money(100), { amount: 100, currency: "USD" as "EUR" })).toThrow(MoneyError);
  });
  it("refuses non-integer minor units", () => {
    expect(() => money(10.5)).toThrow(MoneyError);
  });
});

describe("formatMoney — Dutch notation on every page (D-14)", () => {
  it("formats € 49,95", () => {
    // Intl uses a non-breaking space between symbol and amount.
    expect(formatMoney(money(4995)).replace(/\s/g, " ")).toBe("€ 49,95");
    expect(formatMoney(money(123456)).replace(/\s/g, " ")).toBe("€ 1.234,56");
  });
  it("drops ,00 only for round amounts in running text", () => {
    expect(formatMoneyShort(money(5000)).replace(/\s/g, " ")).toBe("€ 50");
    expect(formatMoneyShort(money(595)).replace(/\s/g, " ")).toBe("€ 5,95");
  });
});

describe("sellingPrice (until D-03): the advised price excluding VAT plus VAT", () => {
  it("adds the VAT once, rounded half up to a cent", () => {
    // By hand: € 15,29 × 1,21 = € 18,5009 → € 18,50; € 18,50 × 1,21 = € 22,385 → € 22,39 (half up);
    // € 10,00 at 9 % = € 10,90; € 0,00 stays € 0,00.
    expect(sellingPrice(money(1529), 2100)).toEqual(money(1850));
    expect(sellingPrice(money(1850), 2100)).toEqual(money(2239));
    expect(sellingPrice(money(1000), 900)).toEqual(money(1090));
    expect(sellingPrice(money(0), 2100)).toEqual(money(0));
  });
  it("refuses what is not an amount or a rate", () => {
    expect(() => sellingPrice({ amount: -1, currency: "EUR" }, 2100)).toThrow();
    expect(() => sellingPrice({ amount: 12.5, currency: "EUR" }, 2100)).toThrow();
    expect(() => sellingPrice(money(1000), -100)).toThrow();
    expect(() => sellingPrice(money(1000), 21.5)).toThrow();
  });
});
