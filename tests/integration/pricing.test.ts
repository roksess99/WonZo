// Price rules and promotions against the test database (D-03, D-08, D-16):
// saved with a check on the version and an audit line; the catalog prices with
// them; an order freezes the list price and the promotion; stopping keeps the
// row; the price history records changes only. Leaves the rules empty again,
// because the other files expect the advised price.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { forgetPricing, getProduct } from "@/lib/catalog/provider";
import { getPool, selectRows, toDbTime } from "@/lib/db";
import { recordPrices } from "@/lib/discounts/history";
import { createPromotion, loadPricing, savePriceRules, stopPromotion } from "@/lib/discounts/store";
import { placeOrder } from "@/lib/orders";

const actor = "admin:test-pricing";
const HOUR = 3_600_000;

async function version() {
  return (await loadPricing(getPool(), new Date())).version;
}

/** Back to no rule and no running promotion: what the other files price with. */
async function clean() {
  await getPool().query("UPDATE promotions SET ends_at = ?, stopped_at = ?, stopped_by = ? WHERE ends_at > ?", [toDbTime(new Date()), toDbTime(new Date()), actor, toDbTime(new Date())]);
  await savePriceRules({ defaultMarkup: "", paymentCost: "0", markups: {}, expectedVersion: await version(), actor });
  forgetPricing();
}

beforeAll(clean);
afterAll(async () => {
  await clean();
  await getPool().end();
});

describe("the price rule (D-03, D-16)", () => {
  it("refuses out of range, without a change", async () => {
    const v = await version();
    expect(await savePriceRules({ defaultMarkup: "1000,01", paymentCost: "0", markups: {}, expectedVersion: v, actor })).toEqual({ ok: false, error: "markup" });
    expect(await savePriceRules({ defaultMarkup: "40", paymentCost: "-1", markups: {}, expectedVersion: v, actor })).toEqual({ ok: false, error: "payment-cost" });
    expect(await savePriceRules({ defaultMarkup: "40", paymentCost: "0", markups: { "wonen/decoratie": "abc" }, expectedVersion: v, actor })).toEqual({ ok: false, error: "subcategory-markup", key: "wonen/decoratie" });
    expect(await version()).toBe(v);
  });

  it("saves with an audit line, raises the version, and the catalog prices with it", async () => {
    const v = await version();
    expect(await savePriceRules({ defaultMarkup: "40", paymentCost: "0,32", markups: { "wonen/opslag": "10" }, expectedVersion: v, actor })).toEqual({ ok: true, changed: true });
    expect(await version()).toBe(v + 1);
    const [audit] = await selectRows<{ after_state: string | object }>(getPool(), "SELECT after_state FROM audit_log WHERE action = 'prices.rules' AND actor = ? ORDER BY id DESC LIMIT 1", [actor]);
    const after = typeof audit!.after_state === "string" ? JSON.parse(audit!.after_state) : audit!.after_state;
    expect(after).toEqual({ defaultMarkupBp: 4000, paymentCostCents: 32, markups: { "wonen/opslag": 1000 } });

    forgetPricing();
    // By hand: the candle holder costs € 7,42; + 40 % = € 10,388 → € 10,39; × 1,21 = € 12,5719 → € 12,57.
    expect((await getProduct("nl", "1300106"))?.price).toEqual({ amount: 1257, currency: "EUR" });
  });

  it("refuses a save on a version the form did not show, and saving the same is no change", async () => {
    const v = await version();
    expect(await savePriceRules({ defaultMarkup: "50", paymentCost: "0,32", markups: {}, expectedVersion: v - 1, actor })).toEqual({ ok: false, error: "changed" });
    expect(await savePriceRules({ defaultMarkup: "40", paymentCost: "0,32", markups: { "wonen/opslag": "10" }, expectedVersion: v, actor })).toEqual({ ok: true, changed: false });
    expect(await version()).toBe(v);
  });
});

describe("promotions (D-08)", () => {
  let promotionId = "";

  it("refuses what is not a promotion", async () => {
    const now = new Date();
    const base = { name: "Test", target: { kind: "product" as const, key: "1300106" }, percent: "20", startsAt: now, endsAt: new Date(now.getTime() + HOUR), actor };
    expect(await createPromotion({ ...base, name: "x" })).toEqual({ ok: false, error: "name" });
    expect(await createPromotion({ ...base, target: null })).toEqual({ ok: false, error: "target" });
    expect(await createPromotion({ ...base, percent: "0" })).toEqual({ ok: false, error: "percent" });
    expect(await createPromotion({ ...base, percent: "95,01" })).toEqual({ ok: false, error: "percent" });
    expect(await createPromotion({ ...base, endsAt: now })).toEqual({ ok: false, error: "dates" });
  });

  it("a running promotion lowers the price; an order freezes the list price and the promotion", async () => {
    const now = new Date();
    const r = await createPromotion({ name: "Kaarsen", target: { kind: "product", key: "1300106" }, percent: "20", startsAt: now, endsAt: new Date(now.getTime() + HOUR), actor });
    expect(r.ok).toBe(true);
    promotionId = r.ok ? r.id : "";
    forgetPricing();
    // By hand: € 12,57 − 20 % = € 10,056 → € 10,06, above the floor (€ 7,42 + € 0,32) × 1,21 = € 9,3654 → € 9,37;
    // shown: (12,57 − 10,06) / 12,57 = 19,97 % → 19 % (rounded down).
    const p = (await getProduct("nl", "1300106"))!;
    expect(p.price).toEqual({ amount: 1006, currency: "EUR" });
    expect(p.promotion).toMatchObject({ id: promotionId, listPrice: { amount: 1257, currency: "EUR" }, shownPercent: 19 });

    const customer = { email: `pricing-${randomUUID().slice(0, 8)}@example.nl`, phone: "0612345678", firstName: "Test", lastName: "Prijs", street: "Teststraat", houseNumber: "1", postcode: "1234 AB", city: "Arnhem" };
    const o = await placeOrder({ checkoutAttemptId: randomUUID(), locale: "nl", lines: [{ source: "bigbuy", productId: "1300106", quantity: 1 }], customer }, new Date());
    expect(o.kind).toBe("placed");
    const [line] = await selectRows<{ unit_price_cents: number; list_price_cents: number; promotion_id: number | string }>(getPool(), "SELECT unit_price_cents, list_price_cents, promotion_id FROM order_lines WHERE order_id = ?", [o.kind === "placed" ? o.orderId : 0]);
    expect([Number(line!.unit_price_cents), Number(line!.list_price_cents), String(line!.promotion_id)]).toEqual([1006, 1257, promotionId]);
  });

  it("records the price history only when a price changes", async () => {
    expect(await recordPrices(new Date())).toBeGreaterThan(0);
    expect(await recordPrices(new Date())).toBe(0);
    const [h] = await selectRows<{ price_cents: number; list_price_cents: number; promotion_id: number | string }>(getPool(), "SELECT price_cents, list_price_cents, promotion_id FROM price_history WHERE product_id = '1300106' ORDER BY from_at DESC LIMIT 1");
    expect([Number(h!.price_cents), Number(h!.list_price_cents), String(h!.promotion_id)]).toEqual([1006, 1257, promotionId]);
  });

  it("stopping keeps the row, ends it now, and the price goes back", async () => {
    expect(await stopPromotion({ id: promotionId, actor })).toEqual({ ok: true, id: promotionId });
    expect(await stopPromotion({ id: promotionId, actor })).toEqual({ ok: false, error: "ended" });
    const [row] = await selectRows<{ stopped_by: string }>(getPool(), "SELECT stopped_by FROM promotions WHERE id = ?", [promotionId]);
    expect(row?.stopped_by).toBe(actor);
    forgetPricing();
    expect((await getProduct("nl", "1300106"))?.promotion).toBeNull();
    expect((await getProduct("nl", "1300106"))?.price).toEqual({ amount: 1257, currency: "EUR" });
  });
});
