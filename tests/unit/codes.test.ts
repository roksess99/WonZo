// Discount codes without a database (docs/PRIJZEN.md § 3, D-08, D-15): what
// a code text may be, how the amount is spread over the lines, the floor,
// lines in a promotion, the free-shipping rule, VAT after the code, and what
// a return gives back. Every amount worked out by hand in the comments.

import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/cart/route";
import type { CartLine } from "@/lib/cart/cart";
import { quoteCart } from "@/lib/cart/quote";
import type { Product } from "@/lib/catalog/types";
import { money } from "@/lib/money";
import { allocate, applyCode, normalizeCode, returnedShare, type CodeLookup } from "@/lib/pricing/codes";
import type { ShippingPolicy } from "@/lib/pricing/shipping";
import { vatBreakdown } from "@/lib/pricing/vat";
import { quoteReturn, type ReturnableOrder } from "@/lib/returns/amount";

const line = (productId: string, quantity = 1): CartLine => ({ source: "bigbuy", productId, quantity });
const policy: ShippingPolicy = { fee: money(495), freeFrom: money(4000), largeAbove: money(2000) };
const ten: CodeLookup = { kind: "ok", code: { id: "5", code: "WELKOM10", percentBp: 1000, minSubtotalCents: 0 } };

function product(id: string, cents: number, promoted = false): Product {
  return {
    id, source: "bigbuy", slug: `p-${id}`, name: `P ${id}`, brand: null, sku: `S${id}`, ean: null, price: money(cents),
    promotion: promoted ? { id: "7", listPrice: money(cents + 300), shownPercent: 19, endsAt: "2026-12-01T00:00:00.000Z" } : null,
    vatRateBasisPoints: 2100, availability: "in_stock", stock: 10, offerId: `${id}-1`,
    delivery: { minWorkingDays: 3, maxWorkingDays: 6, shipsFrom: "ES" }, shippingAlone: money(858), imageUrls: [],
    categoryKey: "wonen", subcategoryKey: "opslag", specs: [], description: [], safety: { manufacturer: null, warnings: [] }, addedAt: "2026-01-01",
  };
}

describe("what a code text may be", () => {
  it("3 to 32 letters, digits and dashes, in capitals", () => {
    expect(normalizeCode(" welkom10 ")).toBe("WELKOM10");
    expect(normalizeCode("ZOMER-2026")).toBe("ZOMER-2026");
    for (const bad of ["ab", "-AB", "AB-", "WEL KOM", "€10", "X".repeat(33), 10]) expect(normalizeCode(bad)).toBeNull();
  });
});

describe("spreading over the lines (D-15: largest remainder, a tie to the first line)", () => {
  it("adds up to the amount exactly", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]); // 33,33 each; the tie goes to the first
    expect(allocate(500, [2998, 2000, 0])).toEqual([300, 200, 0]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(7, [1, 2, 4])).toEqual([1, 2, 4]);
    expect(() => allocate(5, [0, 0])).toThrow();
  });
});

describe("applying a code", () => {
  const lines = [
    { lineTotal: money(2998), promoted: false, room: 998 },
    { lineTotal: money(2000), promoted: false, room: 200 },
    { lineTotal: money(1257), promoted: true, room: 300 },
  ];

  it("10 % over the lines without a promotion, spread by line total", () => {
    // Base € 29,98 + € 20,00 = € 49,98; 10 % = € 4,998 → € 5,00.
    // € 5,00 × 2998/4998 = 299,92 → 299 (rest 4598); × 2000/4998 = 200,08 → 200 (rest 400); the cent left to line 1.
    expect(applyCode(ten, lines, money(6255))).toEqual({ kind: "applied", code: "WELKOM10", codeId: "5", percentBp: 1000, discount: money(500), perLine: [300, 200, 0], limited: false, skippedPromoted: true });
  });

  it("never below the floor: a share is cut to the room of its line, and not moved to another", () => {
    const tight = lines.map((l, i) => (i === 1 ? { ...l, room: 100 } : l));
    expect(applyCode(ten, tight, money(6255))).toMatchObject({ discount: money(400), perLine: [300, 100, 0], limited: true });
  });

  it("refuses below the minimum, and when only lines in a promotion are left", () => {
    const min: CodeLookup = { kind: "ok", code: { ...(ten as { code: { id: string; code: string; percentBp: number; minSubtotalCents: number } }).code, minSubtotalCents: 7500 } };
    expect(applyCode(min, lines, money(6255))).toEqual({ kind: "refused", code: "WELKOM10", reason: "min-subtotal", minSubtotal: money(7500) });
    expect(applyCode(ten, [lines[2]!], money(1257))).toEqual({ kind: "refused", code: "WELKOM10", reason: "promoted-only" });
    expect(applyCode({ kind: "refused", code: "OUD", reason: "ended" }, lines, money(6255))).toEqual({ kind: "refused", code: "OUD", reason: "ended" });
  });
});

describe("the code in the quote", () => {
  const catalog = [product("1", 2998), product("2", 1000), product("3", 1257, true), product("4", 4200)];
  const floors = new Map([["bigbuy:1", money(2000)], ["bigbuy:2", money(900)], ["bigbuy:3", money(1000)], ["bigbuy:4", money(3000)]]);

  it("subtotal − code + shipping, with each line's share", () => {
    // € 29,98 + 2 × € 10,00 + € 12,57 = € 62,55, free shipping (≥ € 40); − € 5,00 = € 57,55.
    const q = quoteCart([line("1"), line("2", 2), line("3")], catalog, policy, { lookup: ten, floors });
    expect(q.subtotal).toEqual(money(6255));
    expect(q.discount).toEqual(money(500));
    expect(q.total).toEqual(money(5755));
    expect(q.lines.map((l) => (l.status === "unavailable" ? null : l.codeDiscount.amount))).toEqual([300, 200, 0]);
    expect(q.readyForCheckout).toBe(true);
  });

  it("a code never makes an order more expensive: free shipping counts the subtotal before it", () => {
    // € 42,00 is free; − 10 % = € 37,80, still free (otherwise € 37,80 + € 4,95 = € 42,75 > € 42,00).
    const q = quoteCart([line("4")], catalog, policy, { lookup: ten, floors });
    expect(q.shipping.standard).toEqual({ kind: "free" });
    expect(q.total).toEqual(money(3780));
  });

  it("no known floor: no room, so no discount on that line", () => {
    const q = quoteCart([line("1")], catalog, policy, { lookup: ten, floors: new Map() });
    expect(q.code).toMatchObject({ kind: "applied", discount: money(0), limited: true });
    expect(q.total).toEqual(money(2998 + 495));
  });

  it("a refused code is in the quote, the lines can still check out, the total is without it", () => {
    const q = quoteCart([line("1")], catalog, policy, { lookup: { kind: "refused", code: "OUD", reason: "ended" }, floors });
    expect(q.code).toEqual({ kind: "refused", code: "OUD", reason: "ended" });
    expect(q.discount).toEqual(money(0));
    expect(q.readyForCheckout).toBe(true);
  });

  it("the cart endpoint without a database: every code is unknown, the cart still prices", async () => {
    const res = await POST(new Request("http://localhost/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: "nl", lines: [{ source: "bigbuy", productId: "1300106", quantity: 1 }], code: "welkom10" }) }));
    expect(res.status).toBe(200);
    expect((await res.json()).code).toEqual({ kind: "refused", code: "WELKOM10", reason: "unknown" });
  });
});

describe("VAT after the code (D-15)", () => {
  it("comes out of what was paid for the line", () => {
    // € 29,98 − € 3,00 = € 26,98; excl. = 26,98 / 1,21 = 22,2975 → € 22,30; VAT € 4,68.
    const v = vatBreakdown([{ quantity: 1, unitPrice: money(2998), lineTotal: money(2998), vatRateBp: 2100, discount: money(300) }], money(0));
    expect(v.lines[0]).toMatchObject({ discount: money(300), totalIncl: money(2698), totalExcl: money(2230), vat: money(468) });
    expect(v.totalIncl).toEqual(money(2698));
    expect(() => vatBreakdown([{ quantity: 1, unitPrice: money(100), lineTotal: money(100), vatRateBp: 2100, discount: money(101) }], money(0))).toThrow();
  });
});

describe("a return gives back what was paid, not more (docs/PRIJZEN.md: Verdelen over de regels)", () => {
  it("per piece, cumulative and rounded down: all returns of a line give back exactly its share", () => {
    // € 1,00 code on 3 pieces: 33, then 33, then 34 cents.
    expect([returnedShare(100, 3, 0, 1), returnedShare(100, 3, 1, 1), returnedShare(100, 3, 2, 1)]).toEqual([33, 33, 34]);
    expect(returnedShare(100, 3, 0, 3)).toBe(100);
    expect(returnedShare(0, 3, 0, 2)).toBe(0);
  });

  it("the return amount less the code's share", () => {
    const order = (returned: number): ReturnableOrder => ({
      lines: [{ lineNo: 1, bought: 3, returned, unitPrice: money(1000), codeDiscount: money(100), largeShipping: null }],
      shippingStandard: money(0),
      earlierShipping: money(0),
      deliveredAt: null,
    });
    const now = new Date("2026-11-02T12:00:00Z");
    // One piece: € 10,00 − € 0,33 = € 9,67. Then the other two: € 20,00 − € 0,67 = € 19,33. Together € 29,00 = what was paid.
    expect(quoteReturn(order(0), [{ lineNo: 1, quantity: 1, reason: "none" }], now)).toMatchObject({ ok: true, lines: money(967), codeShares: { 1: 33 } });
    expect(quoteReturn(order(1), [{ lineNo: 1, quantity: 2, reason: "none" }], now)).toMatchObject({ ok: true, lines: money(1933), codeShares: { 1: 67 } });
  });
});
