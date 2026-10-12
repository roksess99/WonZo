// Paying and paying back against the test database, with a stand-in for
// Mollie (./fake-mollie.ts). One test per row of docs/PAYMENTS.md "wat er
// misgaat per stap" and "wanneer lokaal en provider uiteenlopen" that this
// fase covers (docs/TESTEN.md § Integration).

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { orderAction } from "@/lib/checkout";
import { getPool, selectRows } from "@/lib/db";
import { placeOrder } from "@/lib/orders";
import { CANCEL_WINDOW_MS, SNAPSHOT_VALID_MS } from "@/lib/orders/states";
import { cancelByCustomer, expireUnpaidOrders, handleWebhook, reconcile, startPayment } from "@/lib/payments";
import { money } from "@/lib/money";
import { FakeMollie } from "./fake-mollie";

afterAll(async () => {
  await getPool().end();
});

let mollie: FakeMollie;
beforeEach(() => {
  mollie = new FakeMollie();
});

const customer = { email: "test@example.nl", phone: "0612345678", firstName: "Test", lastName: "Klant", street: "Teststraat", houseNumber: "1", postcode: "1234 AB", city: "Arnhem" };
const lines = [{ source: "bigbuy", productId: "1300106", quantity: 1 }]; // € 18,50 + € 5,95 = € 24,45

async function newOrder(now = new Date()) {
  const r = await placeOrder({ checkoutAttemptId: randomUUID(), locale: "nl", lines, customer }, now);
  if (r.kind !== "placed") throw new Error(r.kind);
  return r.orderId;
}
const urls = { redirectUrl: "https://wonzo.nl/bestelling/x", webhookUrl: "https://wonzo.nl/api/payments/webhook" };
const start = (orderId: number, now = new Date()) => startPayment({ orderId, ...urls, now }, mollie);
const orderRow = async (id: number) =>
  (await selectRows<{ status: string; hold_reason: string | null }>(getPool(), "SELECT status, hold_reason FROM orders WHERE id = ?", [id]))[0]!;
const paymentsOf = async (orderId: number) =>
  selectRows<{ status: string; provider_payment_id: string | null }>(getPool(), "SELECT status, provider_payment_id FROM payments WHERE order_id = ? ORDER BY created_at, id", [orderId]);
const outboxKinds = async (orderId: number) =>
  (await selectRows<{ kind: string }>(getPool(), "SELECT kind FROM outbox WHERE JSON_VALUE(payload, '$.orderId') = ? ORDER BY id", [orderId])).map((r) => r.kind);
const refundsOf = async (orderId: number) =>
  selectRows<{ status: string; amount_cents: number | string }>(getPool(), "SELECT status, amount_cents FROM refunds WHERE order_id = ? ORDER BY created_at, id", [orderId]);

async function paidOrder(now = new Date()) {
  const orderId = await newOrder(now);
  await start(orderId, now);
  const tr = mollie.idOfOrder(orderId);
  mollie.setStatus(tr, "paid");
  await handleWebhook(tr, mollie, now);
  return { orderId, tr };
}

describe("starting a payment", () => {
  it("records the payment before the provider call, and sends the provider to the payment page", async () => {
    const orderId = await newOrder();
    const r = await start(orderId);
    expect(r.kind).toBe("redirect");
    expect((r as { url: string }).url).toMatch(/^https:\/\/www\.mollie\.com\/checkout\//);
    const [p] = await paymentsOf(orderId);
    expect(p).toMatchObject({ status: "PENDING" });
    expect(p!.provider_payment_id).toMatch(/^tr_/);
    // The amount went to the provider from the frozen order: € 24,45.
    expect(mollie.payments.get(p!.provider_payment_id!)!.amount).toEqual(money(2445));
  });

  it("offers the same payment page again on a second click, without a second payment", async () => {
    const orderId = await newOrder();
    const a = await start(orderId);
    const b = await start(orderId);
    expect(b).toEqual(a);
    expect(await paymentsOf(orderId)).toHaveLength(1);
  });

  it("no answer from the provider: UNKNOWN and 'try again' — and the webhook links it later by our id", async () => {
    const orderId = await newOrder();
    mollie.next.create = "lost-after-create";
    expect(await start(orderId)).toEqual({ kind: "try-again" });
    expect(await paymentsOf(orderId)).toEqual([{ status: "UNKNOWN", provider_payment_id: null }]);
    const tr = mollie.idOfOrder(orderId);
    mollie.setStatus(tr, "paid");
    await handleWebhook(tr, mollie);
    expect(await paymentsOf(orderId)).toEqual([{ status: "PAID", provider_payment_id: tr }]);
    expect((await orderRow(orderId)).status).toBe("PAID");
  });

  it("a refusal by the provider: payment FAILED, order PAYMENT_FAILED, and a new attempt can follow", async () => {
    const orderId = await newOrder();
    mollie.next.create = "refuse";
    expect(await start(orderId)).toEqual({ kind: "refused" });
    expect((await orderRow(orderId)).status).toBe("PAYMENT_FAILED");
    expect((await start(orderId)).kind).toBe("redirect");
    expect((await orderRow(orderId)).status).toBe("PENDING_PAYMENT");
  });

  it("refuses to start on an expired order", async () => {
    const now = new Date();
    const orderId = await newOrder(now);
    expect(await start(orderId, new Date(now.getTime() + SNAPSHOT_VALID_MS))).toEqual({ kind: "not-payable" });
    expect(await paymentsOf(orderId)).toHaveLength(0);
  });
});

describe("the webhook", () => {
  it("paid: payment and order PAID once, confirmation in the outbox once — a repeat changes nothing", async () => {
    const { orderId, tr } = await paidOrder();
    await handleWebhook(tr, mollie);
    await handleWebhook(tr, mollie);
    expect((await orderRow(orderId)).status).toBe("PAID");
    expect(await outboxKinds(orderId)).toEqual(["order-confirmation", "admin-new-order"]);
    expect(Number((await selectRows<{ n: number }>(getPool(), "SELECT COUNT(*) AS n FROM provider_events WHERE resource_id = ?", [tr]))[0]!.n)).toBe(2); // PENDING (start), PAID
  });

  it("believes nothing in the call itself: an unknown or malformed id changes nothing", async () => {
    await expect(handleWebhook("tr_doesnotexist", mollie)).resolves.toBeUndefined();
    await expect(handleWebhook("'; DROP TABLE orders; --", mollie)).resolves.toBeUndefined();
  });

  it("another amount than the frozen order: payment PAID, order NOT paid but on hold, with an alert", async () => {
    const orderId = await newOrder();
    mollie.overrideAmount = money(100);
    await start(orderId);
    const tr = mollie.idOfOrder(orderId);
    mollie.setStatus(tr, "paid");
    await handleWebhook(tr, mollie);
    expect(await orderRow(orderId)).toEqual({ status: "PENDING_PAYMENT", hold_reason: "AMOUNT_MISMATCH" });
    expect(await outboxKinds(orderId)).toContain("admin-alert");
  });

  it("expired at the provider: order PAYMENT_FAILED; the customer pays again and the order is paid", async () => {
    const orderId = await newOrder();
    await start(orderId);
    const first = mollie.idOfOrder(orderId);
    mollie.setStatus(first, "expired");
    await handleWebhook(first, mollie);
    expect((await orderRow(orderId)).status).toBe("PAYMENT_FAILED");
    await start(orderId);
    const second = mollie.idOfOrder(orderId);
    expect(second).not.toBe(first);
    mollie.setStatus(second, "paid");
    await handleWebhook(second, mollie);
    expect((await orderRow(orderId)).status).toBe("PAID");
    expect((await paymentsOf(orderId)).map((p) => p.status)).toEqual(["EXPIRED", "PAID"]);
  });

  it("a chargeback: payment CHARGED_BACK and the order on hold", async () => {
    const { orderId, tr } = await paidOrder();
    mollie.chargeBack(tr);
    await handleWebhook(tr, mollie);
    expect((await paymentsOf(orderId))[0]!.status).toBe("CHARGED_BACK");
    expect((await orderRow(orderId)).hold_reason).toBe("CHARGEBACK");
  });
});

describe("the 30-minute window (D-04): the customer cancels", () => {
  it("cancels and pays back the whole amount, once", async () => {
    const now = new Date();
    const { orderId, tr } = await paidOrder(now);
    expect(await cancelByCustomer(orderId, mollie, new Date(now.getTime() + 5 * 60_000))).toEqual({ ok: true });
    expect((await orderRow(orderId)).status).toBe("CANCELLED");
    expect(await refundsOf(orderId)).toEqual([{ status: "SUBMITTED", amount_cents: 2445 }]);
    mollie.settleRefunds();
    await handleWebhook(tr, mollie);
    expect(await refundsOf(orderId)).toEqual([{ status: "SUCCEEDED", amount_cents: 2445 }]);
    expect(await cancelByCustomer(orderId, mollie)).toEqual({ ok: false, reason: "window-closed" });
    expect(await refundsOf(orderId)).toHaveLength(1);
  });

  it("refuses after the window", async () => {
    const now = new Date();
    const { orderId } = await paidOrder(now);
    expect(await cancelByCustomer(orderId, mollie, new Date(now.getTime() + CANCEL_WINDOW_MS))).toEqual({ ok: false, reason: "window-closed" });
    expect((await orderRow(orderId)).status).toBe("PAID");
  });

  it("a refund whose answer was lost: UNKNOWN, found again by its id in the metadata, never sent twice", async () => {
    const now = new Date();
    const { orderId } = await paidOrder(now);
    mollie.next.refund = "lost-after-create";
    await cancelByCustomer(orderId, mollie, now);
    expect((await refundsOf(orderId))[0]!.status).toBe("UNKNOWN");
    mollie.settleRefunds();
    await reconcile(mollie, new Date(now.getTime() + 5 * 60_000));
    expect(await refundsOf(orderId)).toEqual([{ status: "SUCCEEDED", amount_cents: 2445 }]);
    expect(mollie.calls.filter((c) => c.op === "createRefund")).toHaveLength(1);
  });
});

describe("the status page's actions, only with the key from the link", () => {
  const moved = { ...customer, street: "Andere Straat" };

  it("changes the details with the key, inside the window", async () => {
    const now = new Date();
    const placed = await placeOrder({ checkoutAttemptId: randomUUID(), locale: "nl", lines, customer }, now);
    if (placed.kind !== "placed") throw new Error(placed.kind);
    await start(placed.orderId, now);
    const tr = mollie.idOfOrder(placed.orderId);
    mollie.setStatus(tr, "paid");
    await handleWebhook(tr, mollie, now);
    expect(await orderAction({ token: placed.accessToken, action: "details", customer: moved }, new Date(now.getTime() + 60_000))).toEqual({ kind: "done" });
    const [o] = await selectRows<{ street: string }>(getPool(), "SELECT street FROM orders WHERE id = ?", [placed.orderId]);
    expect(o!.street).toBe("Andere Straat");
  });

  it("an unknown or malformed key gets one answer, and changes nothing", async () => {
    expect(await orderAction({ token: "x".repeat(43), action: "details", customer: moved })).toEqual({ kind: "not-found" });
    expect(await orderAction({ token: "kort", action: "cancel" })).toEqual({ kind: "not-found" });
    expect(await orderAction({ action: "cancel" })).toEqual({ kind: "not-found" });
  });

  it("refuses details that are not valid, naming the field", async () => {
    const placed = await placeOrder({ checkoutAttemptId: randomUUID(), locale: "nl", lines, customer });
    if (placed.kind !== "placed") throw new Error(placed.kind);
    expect(await orderAction({ token: placed.accessToken, action: "details", customer: { ...customer, postcode: "nope" } })).toEqual({ kind: "invalid", fields: { postcode: "invalid" } });
  });
});

describe("expiry and reconciliation", () => {
  it("cancels an unpaid order after 60 minutes, once the provider confirms nothing was paid", async () => {
    const now = new Date();
    const orderId = await newOrder(now);
    await start(orderId, now);
    const later = new Date(now.getTime() + SNAPSHOT_VALID_MS + 60_000);
    // Still open at the provider: not cancelled yet.
    expect((await expireUnpaidOrders(mollie, later)).cancelled).not.toContain(orderId);
    mollie.setStatus(mollie.idOfOrder(orderId), "expired");
    expect((await expireUnpaidOrders(mollie, later)).cancelled).toContain(orderId);
    expect((await orderRow(orderId)).status).toBe("CANCELLED");
  });

  it("a missed webhook: reconciliation finds the payment paid, and the order is paid instead of expired", async () => {
    const now = new Date();
    const orderId = await newOrder(now);
    await start(orderId, now);
    mollie.setStatus(mollie.idOfOrder(orderId), "paid"); // no webhook
    await expireUnpaidOrders(mollie, new Date(now.getTime() + SNAPSHOT_VALID_MS + 60_000));
    expect((await orderRow(orderId)).status).toBe("PAID");
  });

  it("paid after the order was cancelled: an alert, never an automatic change", async () => {
    const now = new Date();
    const orderId = await newOrder(now);
    await start(orderId, now);
    const tr = mollie.idOfOrder(orderId);
    mollie.setStatus(tr, "expired");
    await expireUnpaidOrders(mollie, new Date(now.getTime() + SNAPSHOT_VALID_MS + 60_000));
    mollie.setStatus(tr, "paid"); // a bank that is very late
    await handleWebhook(tr, mollie);
    expect((await orderRow(orderId)).status).toBe("CANCELLED");
    expect(await outboxKinds(orderId)).toContain("admin-alert");
  });

  it("gives up a payment the provider never confirmed, after an hour", async () => {
    const now = new Date();
    const orderId = await newOrder(now);
    mollie.next.create = "lost-before-create";
    await start(orderId, now);
    await reconcile(mollie, new Date(now.getTime() + 61 * 60_000));
    expect((await paymentsOf(orderId))[0]!.status).toBe("FAILED");
    expect((await orderRow(orderId)).status).toBe("PAYMENT_FAILED");
  });
});
