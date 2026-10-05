import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/cart/route";
import { addLine, checkLine, itemCount, MAX_LINES, MAX_QUANTITY, readStoredCart, removeLine, setQuantity, storedForm, type CartLine } from "@/lib/cart/cart";
import { parseQuoteRequest, quoteCart } from "@/lib/cart/quote";
import type { Product } from "@/lib/catalog/types";
import { getCatalog } from "@/lib/catalog/provider";
import { money } from "@/lib/money";
import { shippingFor, shippingPolicy, type ShippingPolicy } from "@/lib/pricing/shipping";

const line = (productId: string, quantity = 1): CartLine => ({ source: "bigbuy", productId, quantity });

/** Test values, not the shop's policy (D-13 is open). */
const testPolicy: ShippingPolicy = { fee: money(495), freeFrom: money(5000) };

function product(id: string, cents: number, stock: number, days: [number, number] = [3, 6]): Product {
  return {
    id,
    source: "bigbuy",
    slug: `product-${id}`,
    name: `Product ${id}`,
    brand: null,
    sku: `S${id}`,
    ean: null,
    price: money(cents),
    vatRateBasisPoints: 2100,
    availability: "in_stock",
    stock,
    offerId: `${id}-1`,
    delivery: { minWorkingDays: days[0], maxWorkingDays: days[1], shipsFrom: "ES" },
    imageUrls: [],
    categoryKey: "wonen",
    subcategoryKey: "opslag",
    specs: [],
    description: [],
    safety: { manufacturer: null, warnings: [] },
    addedAt: "2026-01-01",
  };
}

describe("cart lines — references only, refused when out of range", () => {
  it.each([
    [{ source: "bigbuy", productId: "123", quantity: 0 }, "quantity"],
    [{ source: "bigbuy", productId: "123", quantity: -5 }, "quantity"],
    [{ source: "bigbuy", productId: "123", quantity: 1.5 }, "quantity"],
    [{ source: "bigbuy", productId: "123", quantity: "2" }, "quantity"],
    [{ source: "bigbuy", productId: "123", quantity: MAX_QUANTITY + 1 }, "quantity"],
    [{ source: "bigbuy", productId: "12a", quantity: 1 }, "productId"],
    [{ source: "other", productId: "123", quantity: 1 }, "source"],
    [null, "shape"],
    [[1, 2], "shape"],
  ])("refuses %o (%s)", (input, error) => {
    expect(checkLine(input)).toEqual({ ok: false, error });
  });

  it("ignores a price or name the browser adds: they never enter the cart", () => {
    const checked = checkLine({ source: "bigbuy", productId: "123", quantity: 2, price: 1, name: "x" });
    expect(checked).toEqual({ ok: true, line: line("123", 2) });
  });
});

describe("reading browser storage — never stuck on bad data", () => {
  it("drops bad lines, merges duplicates, ignores other versions", () => {
    const stored = { version: 1, lines: [line("1", 2), { productId: "x" }, line("1", 3), line("2"), "junk"] };
    expect(readStoredCart(stored)).toEqual([line("1", 5), line("2")]);
    expect(readStoredCart({ version: 2, lines: [line("1")] })).toEqual([]);
    expect(readStoredCart("not an object")).toEqual([]);
    expect(readStoredCart(storedForm([line("7", 4)]))).toEqual([line("7", 4)]);
  });

  it("keeps at most MAX_LINES lines", () => {
    const many = Array.from({ length: MAX_LINES + 10 }, (_, i) => line(String(i + 1)));
    expect(readStoredCart({ version: 1, lines: many })).toHaveLength(MAX_LINES);
  });
});

describe("adding, changing, removing", () => {
  it("adds and merges on the same product", () => {
    let r = addLine([], line("1", 2), 10);
    expect(r).toMatchObject({ added: true, lines: [line("1", 2)] });
    r = addLine(r.lines, line("1", 3), 10);
    expect(r.lines).toEqual([line("1", 5)]);
    expect(itemCount(r.lines)).toBe(5);
  });

  it("refuses beyond stock instead of trimming, and says how many are in the cart", () => {
    const r = addLine([line("1", 3)], line("1", 2), 4);
    expect(r).toMatchObject({ added: false, reason: "stock", inCart: 3, lines: [line("1", 3)] });
  });

  it("refuses a new product in a full cart", () => {
    const full = Array.from({ length: MAX_LINES }, (_, i) => line(String(i + 1)));
    expect(addLine(full, line("999"), 5)).toMatchObject({ added: false, reason: "full" });
  });

  it("sets a quantity only within range, removes a line", () => {
    const lines = [line("1", 2), line("2", 1)];
    expect(setQuantity(lines, line("1"), 4)).toEqual([line("1", 4), line("2", 1)]);
    expect(setQuantity(lines, line("1"), 0)).toBe(lines);
    expect(setQuantity(lines, line("1"), 2.5)).toBe(lines);
    expect(removeLine(lines, line("1"))).toEqual([line("2", 1)]);
  });
});

describe("shipping (D-13 open: no amounts yet)", () => {
  it("has no policy, so shipping is unknown", () => {
    expect(shippingPolicy).toBeNull();
    expect(shippingFor(money(10000))).toEqual({ kind: "unknown" });
  });

  it("with a policy: exactly on the threshold ships free, one cent below does not", () => {
    expect(shippingFor(money(5000), testPolicy)).toEqual({ kind: "free" });
    expect(shippingFor(money(4999), testPolicy)).toEqual({ kind: "fee", amount: money(495), remainingForFree: money(1) });
    expect(shippingFor(money(1), testPolicy)).toEqual({ kind: "fee", amount: money(495), remainingForFree: money(4999) });
  });
});

describe("quoteCart — every amount from the catalog", () => {
  const catalog = [product("1", 1999, 5, [3, 6]), product("2", 1, 2, [4, 8])];

  it("prices lines and totals in cents", () => {
    const q = quoteCart([line("1", 2), line("2", 1)], catalog, testPolicy);
    expect(q.lines.map((l) => l.status)).toEqual(["ok", "ok"]);
    expect(q.subtotal).toEqual(money(3999)); // 2 × 19,99 + 0,01
    expect(q.itemCount).toBe(3);
    expect(q.shipping).toEqual({ kind: "fee", amount: money(495), remainingForFree: money(1001) });
    expect(q.total).toEqual(money(4494));
    expect(q.delivery).toEqual({ minWorkingDays: 4, maxWorkingDays: 8, shipsFrom: ["ES"] });
    expect(q.readyForCheckout).toBe(true);
  });

  it("without a shipping policy the total says it excludes shipping", () => {
    const q = quoteCart([line("1")], catalog, null);
    expect(q.total).toEqual(money(1999));
    expect(q.totalIncludesShipping).toBe(false);
  });

  it("marks lines over stock and gone products, and is not ready for checkout", () => {
    const q = quoteCart([line("2", 3), line("404", 1)], catalog, null);
    expect(q.lines.map((l) => l.status)).toEqual(["limited", "unavailable"]);
    expect(q.subtotal).toEqual(money(3)); // the gone product is not counted
    expect(q.readyForCheckout).toBe(false);
  });

  it("an empty cart costs nothing and has no shipping", () => {
    const q = quoteCart([], catalog, testPolicy);
    expect(q).toMatchObject({ itemCount: 0, subtotal: money(0), shipping: { kind: "unknown" }, readyForCheckout: false });
  });

  it("gives the same unit price as the product page (one source)", async () => {
    const nl = await getCatalog("nl");
    const p = nl[0]!;
    const q = quoteCart([line(p.id, 1)], nl, null);
    expect(q.lines[0]).toMatchObject({ status: "ok", unitPrice: p.price });
  });
});

describe("parseQuoteRequest — strict at the edge", () => {
  it("accepts a valid request and refuses the rest", () => {
    expect(parseQuoteRequest({ locale: "en", lines: [line("1", 2)] })).toEqual({ ok: true, request: { locale: "en", lines: [line("1", 2)] } });
    expect(parseQuoteRequest({ locale: "de", lines: [] })).toMatchObject({ ok: false, error: "locale" });
    expect(parseQuoteRequest({ locale: "nl", lines: [line("1"), line("1")] })).toMatchObject({ ok: false, error: "line: duplicate" });
    expect(parseQuoteRequest({ locale: "nl", lines: [{ ...line("1"), quantity: -1 }] })).toMatchObject({ ok: false, error: "line: quantity" });
    expect(parseQuoteRequest({ locale: "nl", lines: Array.from({ length: MAX_LINES + 1 }, (_, i) => line(String(i + 1))) })).toMatchObject({
      ok: false,
      error: "lines",
    });
  });
});

describe("POST /api/cart", () => {
  const post = (body: string, contentType = "application/json") =>
    POST(new Request("http://localhost/api/cart", { method: "POST", headers: { "Content-Type": contentType }, body }));

  it("returns a quote with prices from the catalog", async () => {
    const nl = await getCatalog("nl");
    const p = nl[0]!;
    const res = await post(JSON.stringify({ locale: "nl", lines: [line(p.id, 2)] }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.subtotal).toEqual({ amount: p.price.amount * 2, currency: "EUR" });
  });

  it("refuses wrong content type, broken JSON, bad lines and oversized bodies", async () => {
    expect((await post("{}", "text/plain")).status).toBe(415);
    expect((await post("{not json")).status).toBe(400);
    expect((await post(JSON.stringify({ locale: "nl", lines: [{ ...line("1"), quantity: 0 }] }))).status).toBe(400);
    expect((await post(" ".repeat(17 * 1024))).status).toBe(413);
  });

  it("says honestly when the supplier is unavailable", async () => {
    process.env.CATALOG_MOCK_SCENARIO = "unavailable";
    try {
      const res = await post(JSON.stringify({ locale: "nl", lines: [line("1")] }));
      expect(res.status).toBe(503);
    } finally {
      delete process.env.CATALOG_MOCK_SCENARIO;
    }
  });
});
