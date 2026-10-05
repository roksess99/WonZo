import { describe, expect, it } from "vitest";
import { add, formatMoney, fromDecimal, money, MoneyError } from "@/lib/money";

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
});
