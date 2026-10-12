// Purchasing at the supplier against the test database, with stand-ins for
// Mollie and BigBuy (./fake-mollie.ts, ./fake-bigbuy.ts): one test per rule
// of D-04 and docs/STATE_MACHINES.md § Supplier order. Nothing here talks to
// a real supplier (.claude/rules/testen.md: a test that would place a real
// order is a bug in the test).

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cancelAndRefund, acceptPurchasePrice, retryPurchaseAction } from "@/lib/admin/order-actions";
import { attentionItems } from "@/lib/admin/orders";
import { getPool, selectRows } from "@/lib/db";
import { placeOrder, releaseClosedWindows } from "@/lib/orders";
import { runPurchasing, supplierOrdersOf } from "@/lib/orders/purchasing";
import { CANCEL_WINDOW_MS } from "@/lib/orders/states";
import { RETRY_EVERY_MS, RETRY_FOR_MS } from "@/lib/orders/supplier-states";
import { handleWebhook, startPayment } from "@/lib/payments";
import { FakeBigBuy } from "./fake-bigbuy";
import { FakeMollie } from "./fake-mollie";

afterAll(async () => {
  await getPool().end();
});

let mollie: FakeMollie;
let bigbuy: FakeBigBuy;
beforeEach(() => {
  mollie = new FakeMollie();
  bigbuy = new FakeBigBuy();
});

const actor = "admin:test";
const customer = { email: "inkoop@example.nl", phone: "0612345678", firstName: "Test", lastName: "Klant", street: "Teststraat", houseNumber: "1", postcode: "1234 AB", city: "Arnhem" };
const lines = [{ source: "bigbuy", productId: "1300106", quantity: 2 }];
const urls = { redirectUrl: "https://wonzo.nl/bestelling/x", webhookUrl: "https://wonzo.nl/api/payments/webhook" };
const minutes = (from: Date, n: number) => new Date(from.getTime() + n * 60_000);

/** Paid, and the 30-minute window closed: FULFILLMENT_PENDING, with "supplier-order" in the outbox. */
async function released(now = new Date()) {
  const r = await placeOrder({ checkoutAttemptId: randomUUID(), locale: "nl", lines, customer }, now);
  if (r.kind !== "placed") throw new Error(r.kind);
  await startPayment({ orderId: r.orderId, ...urls, now }, mollie);
  const tr = mollie.idOfOrder(r.orderId);
  mollie.setStatus(tr, "paid");
  await handleWebhook(tr, mollie, now);
  const after = new Date(now.getTime() + CANCEL_WINDOW_MS + 60_000);
  await releaseClosedWindows(after);
  return { orderId: r.orderId, reference: r.reference, at: after };
}
const orderStatus = async (id: number) => (await selectRows<{ status: string }>(getPool(), "SELECT status FROM orders WHERE id = ?", [id]))[0]!.status;
const purchase = async (orderId: number) => (await supplierOrdersOf(getPool(), orderId))[0]!;
const alerts = async (orderId: number) =>
  (await selectRows<{ dedupe_key: string }>(getPool(), "SELECT dedupe_key FROM outbox WHERE kind = 'admin-alert' AND JSON_VALUE(payload, '$.orderId') = ? ORDER BY id", [orderId])).map((r) => r.dedupe_key);
/** The frozen purchase price per piece of the order's (only) line, and its SKU. */
const frozenLine = async (orderId: number) => {
  const [l] = await selectRows<{ sku: string; cost: number | string }>(getPool(), "SELECT sku, supplier_cost_cents AS cost FROM order_lines WHERE order_id = ?", [orderId]);
  return { sku: l!.sku, cost: Number(l!.cost) };
};
const attentionFor = async (orderId: number, now: Date) => (await attentionItems(getPool(), now)).filter((i) => i.orderId === orderId).map((i) => i.kind);

describe("after the window: one purchase order, placed once", () => {
  it("places it under the order number, with the frozen lines and the address; the order is PURCHASED", async () => {
    const o = await released();
    await runPurchasing(bigbuy, o.at);
    const p = await purchase(o.orderId);
    expect(p).toMatchObject({ status: "PLACED", reference: o.reference, attempts: 1 });
    expect(p.supplierOrderRef).toBe(bigbuy.placed.get(o.reference)!.id);
    expect(await orderStatus(o.orderId)).toBe("PURCHASED");
    const sent = bigbuy.placed.get(o.reference)!.request;
    expect(sent.lines).toEqual([{ sku: expect.any(String), quantity: 2 }]);
    expect(sent.address).toMatchObject({ postcode: "1234 AB", city: "Arnhem", email: "inkoop@example.nl", phone: "0612345678" });
    // A second run changes nothing and sends nothing.
    await runPurchasing(bigbuy, minutes(o.at, 5));
    expect(bigbuy.callsFor(o.reference, "place")).toBe(1);
  });

  it("with ordering off only the purchase order is prepared; nothing goes out", async () => {
    const o = await released();
    await runPurchasing(null, o.at);
    expect((await purchase(o.orderId)).status).toBe("DRAFT");
    expect(await orderStatus(o.orderId)).toBe("FULFILLMENT_PENDING");
  });
});

describe("the price at the supplier (D-04: up to 10 % more is ordered)", () => {
  it("10 % more is ordered; 15 % more waits for the owner, who can let it go at that price", async () => {
    const o = await released();
    // 15 % more per piece: blocked.
    const { sku, cost } = await frozenLine(o.orderId);
    bigbuy.prices.set(sku, Math.ceil((cost * 115) / 100));
    await runPurchasing(bigbuy, o.at);
    const blocked = await purchase(o.orderId);
    expect(blocked).toMatchObject({ status: "DRAFT", blockedReason: "PRICE_INCREASE" });
    expect(bigbuy.callsFor(o.reference, "place")).toBe(0);
    expect(await attentionFor(o.orderId, o.at)).toEqual(["purchase-blocked"]);
    expect((await alerts(o.orderId)).some((k) => k.startsWith(`supplier:${blocked.id}:price`))).toBe(true);

    // The owner accepts; the next run orders at that price.
    expect(await acceptPurchasePrice({ orderId: o.orderId, supplierOrderId: blocked.id, expectedCheckedCents: blocked.checkedProducts!.amount, reason: "prijs gecontroleerd", actor, now: o.at })).toEqual({ ok: true, refund: "none" });
    await runPurchasing(bigbuy, minutes(o.at, 1));
    expect(await purchase(o.orderId)).toMatchObject({ status: "PLACED", priceAcceptedBy: actor });
  });

  it("exactly 10 % more is still ordered without the owner", async () => {
    const o = await released();
    // The highest whole-cent price that is at most 10 % more (rounded down, so never above it).
    const { sku, cost } = await frozenLine(o.orderId);
    bigbuy.prices.set(sku, Math.floor((cost * 110) / 100));
    await runPurchasing(bigbuy, o.at);
    expect((await purchase(o.orderId)).status).toBe("PLACED");
  });
});

describe("a refusal (D-04: alert at once, try again for 24 hours with the same reference)", () => {
  it("alerts at once, waits 30 minutes, tries again with the same reference, and is placed", async () => {
    const o = await released();
    bigbuy.steer(o.reference, { place: ["refuse"] });
    await runPurchasing(bigbuy, o.at);
    const p = await purchase(o.orderId);
    expect(p).toMatchObject({ status: "REJECTED", lastError: expect.stringContaining("not enough balance") });
    expect(await alerts(o.orderId)).toContain(`supplier:${p.id}:failed`);
    expect(await attentionFor(o.orderId, o.at)).toEqual(["purchase-failing"]);
    // Within the 30 minutes: nothing.
    await runPurchasing(bigbuy, minutes(o.at, 10));
    expect(bigbuy.callsFor(o.reference, "place")).toBe(1);
    // After: again, same reference, placed.
    await runPurchasing(bigbuy, new Date(o.at.getTime() + RETRY_EVERY_MS + 1_000));
    expect(await purchase(o.orderId)).toMatchObject({ status: "PLACED", reference: o.reference, attempts: 2 });
    expect(await orderStatus(o.orderId)).toBe("PURCHASED");
    expect(await attentionFor(o.orderId, new Date(o.at.getTime() + RETRY_EVERY_MS + 2_000))).toEqual([]);
  });

  it("after 24 hours of refusals it stops; the owner tries again or cancels and pays back", async () => {
    const o = await released();
    // First the check is refused; the next try, 24 hours later, gets as far as placing, which is refused too.
    bigbuy.steer(o.reference, { check: ["refuse"], place: ["refuse"] });
    await runPurchasing(bigbuy, o.at);
    const late = new Date(o.at.getTime() + RETRY_FOR_MS + 1_000);
    await runPurchasing(bigbuy, late);
    const p = await purchase(o.orderId);
    expect(p.gaveUpAt).not.toBeNull();
    expect(await alerts(o.orderId)).toContain(`supplier:${p.id}:gave-up`);
    expect(await attentionFor(o.orderId, late)).toEqual(["purchase-gave-up"]);
    // Nothing more by itself.
    await runPurchasing(bigbuy, minutes(late, 60));
    expect(bigbuy.callsFor(o.reference, "check")).toBe(2);

    expect(await retryPurchaseAction({ orderId: o.orderId, supplierOrderId: p.id, reason: "tegoed opgewaardeerd", actor, now: late })).toEqual({ ok: true, refund: "none" });
    await runPurchasing(bigbuy, minutes(late, 61));
    expect((await purchase(o.orderId)).status).toBe("PLACED");
  });

  it("or cancel and pay back: the purchase order that never reached BigBuy is cancelled with it", async () => {
    const o = await released();
    bigbuy.steer(o.reference, { place: ["refuse"] });
    await runPurchasing(bigbuy, o.at);
    expect(await cancelAndRefund({ orderId: o.orderId, expectedRefundCents: (await totalOf(o.orderId)), reason: "kan niet inkopen", actor }, mollie)).toEqual({ ok: true, refund: "sent" });
    expect((await purchase(o.orderId)).status).toBe("CANCELLED");
    expect(await orderStatus(o.orderId)).toBe("CANCELLED");
  });
});

describe("no answer from BigBuy: ask by the reference, never send again blindly", () => {
  it("lost after it was created: UNKNOWN, found by the reference, placed — sent once", async () => {
    const o = await released();
    bigbuy.steer(o.reference, { place: ["lost-after-create"] });
    await runPurchasing(bigbuy, o.at);
    expect((await purchase(o.orderId)).status).toBe("UNKNOWN");
    await runPurchasing(bigbuy, minutes(o.at, 3));
    expect(await purchase(o.orderId)).toMatchObject({ status: "PLACED", supplierOrderRef: bigbuy.placed.get(o.reference)!.id });
    expect(bigbuy.callsFor(o.reference, "place")).toBe(1);
    expect(bigbuy.callsFor(o.reference, "lookup")).toBe(1);
  });

  it("lost before it arrived: the reference finds nothing (404), so it is sent again — and placed once", async () => {
    const o = await released();
    bigbuy.steer(o.reference, { place: ["lost-before-create"] });
    await runPurchasing(bigbuy, o.at);
    await runPurchasing(bigbuy, minutes(o.at, 3)); // lookup: absent → REJECTED, due at once
    await runPurchasing(bigbuy, minutes(o.at, 4)); // sent again, same reference
    expect((await purchase(o.orderId)).status).toBe("PLACED");
    expect(bigbuy.placed.has(o.reference)).toBe(true);
    expect(bigbuy.callsFor(o.reference, "place")).toBe(2);
  });

  it("the lookup itself gets no answer: stays UNKNOWN and is asked again", async () => {
    const o = await released();
    bigbuy.steer(o.reference, { place: ["lost-after-create"], lookup: ["unknown"] });
    await runPurchasing(bigbuy, o.at);
    await runPurchasing(bigbuy, minutes(o.at, 3));
    expect((await purchase(o.orderId)).status).toBe("UNKNOWN");
    expect(bigbuy.callsFor(o.reference, "place")).toBe(1);
  });
});

describe("cancelling once BigBuy has it", () => {
  it("is refused: BigBuy has no cancel call (D-04)", async () => {
    const o = await released();
    await runPurchasing(bigbuy, o.at);
    expect(await cancelAndRefund({ orderId: o.orderId, expectedRefundCents: await totalOf(o.orderId), reason: "klant belde", actor }, mollie)).toEqual({ ok: false, error: "not-allowed" });
  });

  it("is refused while the answer is unknown", async () => {
    const o = await released();
    bigbuy.steer(o.reference, { place: ["lost-after-create"] });
    await runPurchasing(bigbuy, o.at);
    expect(await cancelAndRefund({ orderId: o.orderId, expectedRefundCents: await totalOf(o.orderId), reason: "klant belde", actor }, mollie)).toEqual({ ok: false, error: "at-supplier" });
    expect(await orderStatus(o.orderId)).toBe("FULFILLMENT_PENDING");
  });
});

async function totalOf(orderId: number): Promise<number> {
  return Number((await selectRows<{ t: number | string }>(getPool(), "SELECT total_cents AS t FROM orders WHERE id = ?", [orderId]))[0]!.t);
}
