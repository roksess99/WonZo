// Discount codes against the test database (D-08, docs/PRIJZEN.md § 3):
// what the panel refuses, a code frozen into the order and spread over its
// lines, used only once paid, "once per customer" and the maximum decided by
// the database, the invoice equal to what was paid, a return less the code's
// share, and stopping. Every run makes its own codes (a random suffix), so
// runs can follow each other on the same database.

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { CartLine } from "@/lib/cart/cart";
import { quoteCart } from "@/lib/cart/quote";
import { getCatalog } from "@/lib/catalog/provider";
import { getPool, selectRows, withTransaction } from "@/lib/db";
import { codeFloors, createCode, lookupCode, stopCode } from "@/lib/discounts/codes";
import { issueInvoice } from "@/lib/invoices";
import { placeOrder } from "@/lib/orders";
import { transitionOrder } from "@/lib/orders/store";

afterAll(async () => {
  await getPool().end();
});

const actor = "admin:test-codes";
const HOUR = 3_600_000;
const suffix = randomUUID().slice(0, 6).toUpperCase();
const lines: CartLine[] = [
  { source: "bigbuy", productId: "1300118", quantity: 2 },
  { source: "bigbuy", productId: "1300104", quantity: 1 },
];
const customer = (email: string) => ({ email, phone: "0612345678", firstName: "Test", lastName: "Code", street: "Teststraat", houseNumber: "1", postcode: "1234 AB", city: "Arnhem" });
const mail = () => `code-${randomUUID().slice(0, 8)}@example.nl`;

async function newCode(code: string, over: Record<string, unknown> = {}) {
  const now = new Date();
  const r = await createCode({ code, percent: "10", minSubtotal: "", maxUses: "", startsAt: now, endsAt: new Date(now.getTime() + HOUR), actor, ...over });
  if (!r.ok) throw new Error(r.error);
  return r.id;
}
const place = (code: string, email: string) => placeOrder({ checkoutAttemptId: randomUUID(), locale: "nl", lines, customer: customer(email), discountCode: code }, new Date());
const pay = (orderId: number) => withTransaction((conn) => transitionOrder(conn, { orderId, to: "PAID", actor: "provider", now: new Date() }));
const order = async (id: number) =>
  (await selectRows<{ status: string; hold_reason: string | null; discount_code: string | null; discount_cents: number | string; subtotal_cents: number | string; total_cents: number | string }>(
    getPool(), "SELECT status, hold_reason, discount_code, discount_cents, subtotal_cents, total_cents FROM orders WHERE id = ?", [id]))[0]!;
const uses = async (codeId: string) => Number((await selectRows<{ n: number | string }>(getPool(), "SELECT COUNT(*) AS n FROM discount_redemptions WHERE code_id = ?", [codeId]))[0]!.n);

describe("the panel", () => {
  it("refuses what is not a code, and a code that exists already", async () => {
    const now = new Date();
    const base = { code: `T-${suffix}`, percent: "10", minSubtotal: "", maxUses: "", startsAt: now, endsAt: new Date(now.getTime() + HOUR), actor };
    expect(await createCode({ ...base, code: "a b" })).toEqual({ ok: false, error: "code" });
    expect(await createCode({ ...base, percent: "0" })).toEqual({ ok: false, error: "percent" });
    expect(await createCode({ ...base, percent: "95,01" })).toEqual({ ok: false, error: "percent" });
    expect(await createCode({ ...base, minSubtotal: "-5" })).toEqual({ ok: false, error: "min" });
    expect(await createCode({ ...base, maxUses: "0" })).toEqual({ ok: false, error: "max-uses" });
    expect(await createCode({ ...base, endsAt: now })).toEqual({ ok: false, error: "dates" });
    expect((await createCode(base)).ok).toBe(true);
    expect(await createCode({ ...base, code: base.code.toLowerCase() })).toEqual({ ok: false, error: "taken" });
    const [audit] = await selectRows<{ n: number | string }>(getPool(), "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'code.created' AND actor = ?", [actor]);
    expect(Number(audit!.n)).toBeGreaterThan(0);
  });

  it("a code that has not started reads as unknown", async () => {
    const now = new Date();
    await newCode(`LATER-${suffix}`, { startsAt: new Date(now.getTime() + HOUR), endsAt: new Date(now.getTime() + 2 * HOUR) });
    expect(await lookupCode(getPool(), `later-${suffix}`, now)).toEqual({ kind: "refused", code: `LATER-${suffix}`, reason: "unknown" });
  });
});

describe("a code in an order", () => {
  it("is frozen and spread over the lines; used only once paid; once per address", async () => {
    const codeId = await newCode(`WELKOM-${suffix}`);
    const email = mail();
    const r = await place(`welkom-${suffix}`, email);
    if (r.kind !== "placed") throw new Error(r.kind);

    // The same quote the cart page shows, from the same function.
    const catalog = await getCatalog("nl");
    const q = quoteCart(lines, catalog, undefined, { lookup: await lookupCode(getPool(), `WELKOM-${suffix}`, new Date()), floors: await codeFloors("nl") });
    const o = await order(r.orderId);
    expect(o.discount_code).toBe(`WELKOM-${suffix}`);
    expect(Number(o.discount_cents)).toBe(q.discount.amount);
    expect(Number(o.discount_cents)).toBeGreaterThan(0);
    expect(Number(o.total_cents)).toBe(q.total.amount);
    const shares = await selectRows<{ code_discount_cents: number | string }>(getPool(), "SELECT code_discount_cents FROM order_lines WHERE order_id = ? ORDER BY line_no", [r.orderId]);
    expect(shares.reduce((s, l) => s + Number(l.code_discount_cents), 0)).toBe(Number(o.discount_cents));

    // Not used before the payment: an abandoned order does not spend it.
    expect(await uses(codeId)).toBe(0);
    await pay(r.orderId);
    expect(await uses(codeId)).toBe(1);
    expect((await order(r.orderId)).hold_reason).toBeNull();

    // The same address again: refused before anything is stored.
    const again = await place(`WELKOM-${suffix}`, email.toUpperCase());
    expect(again).toMatchObject({ kind: "code-refused", reason: "used" });
    // Another address may.
    expect((await place(`WELKOM-${suffix}`, mail())).kind).toBe("placed");
  });

  it("the invoice says what was paid: the VAT comes out after the code", async () => {
    await newCode(`FACTUUR-${suffix}`);
    const r = await place(`FACTUUR-${suffix}`, mail());
    if (r.kind !== "placed") throw new Error(r.kind);
    await pay(r.orderId);
    await withTransaction((conn) => transitionOrder(conn, { orderId: r.orderId, to: "FULFILLMENT_PENDING", actor: "system", now: new Date() }));
    expect(await issueInvoice(r.orderId)).toBe("created");
    const [inv] = await selectRows<{ total_incl_cents: number | string }>(getPool(), "SELECT total_incl_cents FROM invoices WHERE order_id = ? AND doc_key = 'invoice'", [r.orderId]);
    expect(Number(inv!.total_incl_cents)).toBe(Number((await order(r.orderId)).total_cents));
  });

  it("two paid orders past the maximum: the second is held for the owner, never a silent extra discount", async () => {
    const codeId = await newCode(`EENMAAL-${suffix}`, { maxUses: "1" });
    const a = await place(`EENMAAL-${suffix}`, mail());
    const b = await place(`EENMAAL-${suffix}`, mail());
    if (a.kind !== "placed" || b.kind !== "placed") throw new Error("not placed");
    await pay(a.orderId);
    await pay(b.orderId);
    expect(await uses(codeId)).toBe(1);
    expect(await order(b.orderId)).toMatchObject({ status: "PAID", hold_reason: "CODE_EXHAUSTED" });
    // Now it is used up: a new order is refused.
    expect(await place(`EENMAAL-${suffix}`, mail())).toMatchObject({ kind: "code-refused", reason: "exhausted" });
  });

  it("stopping keeps the row: the code reads as ended", async () => {
    const id = await newCode(`STOP-${suffix}`);
    expect(await stopCode({ id, actor })).toEqual({ ok: true, id });
    expect(await stopCode({ id, actor })).toEqual({ ok: false, error: "ended" });
    expect(await lookupCode(getPool(), `STOP-${suffix}`, new Date(Date.now() + 1000))).toMatchObject({ kind: "refused", reason: "ended" });
  });
});
