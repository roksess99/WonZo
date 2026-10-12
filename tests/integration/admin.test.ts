// The admin's actions on orders against the test database, with the
// stand-in for Mollie (./fake-mollie.ts): what asks for attention, and what
// each choice does to the order, the refunds and the audit log (D-07,
// docs/STATE_MACHINES.md). Each action also gets the two refusals that
// matter for money: a stale amount, and a second click.

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { attentionItems, listOrders, readAdminOrder, searchOrders } from "@/lib/admin/orders";
import { adminOptions, cancelAndRefund, refundPayment, releaseHold } from "@/lib/admin/order-actions";
import { getPool, selectRows } from "@/lib/db";
import { money } from "@/lib/money";
import { placeOrder } from "@/lib/orders";
import { SNAPSHOT_VALID_MS } from "@/lib/orders/states";
import { expireUnpaidOrders, handleWebhook, startPayment } from "@/lib/payments";
import { FakeMollie } from "./fake-mollie";

afterAll(async () => {
  await getPool().end();
});

let mollie: FakeMollie;
beforeEach(() => {
  mollie = new FakeMollie();
});

const actor = "admin:test";
const lines = [{ source: "bigbuy", productId: "1300106", quantity: 1 }]; // € 18,50 + € 5,95 = € 24,45
const urls = { redirectUrl: "https://wonzo.nl/bestelling/x", webhookUrl: "https://wonzo.nl/api/payments/webhook" };

async function newOrder(now = new Date(), email = "test@example.nl") {
  const customer = { email, phone: "0612345678", firstName: "Test", lastName: "Klant", street: "Teststraat", houseNumber: "1", postcode: "1234 AB", city: "Arnhem" };
  const r = await placeOrder({ checkoutAttemptId: randomUUID(), locale: "nl", lines, customer }, now);
  if (r.kind !== "placed") throw new Error(r.kind);
  return { orderId: r.orderId, reference: r.reference };
}
async function paidOrder(now = new Date()) {
  const o = await newOrder(now);
  await startPayment({ orderId: o.orderId, ...urls, now }, mollie);
  const tr = mollie.idOfOrder(o.orderId);
  mollie.setStatus(tr, "paid");
  await handleWebhook(tr, mollie, now);
  return { ...o, tr };
}
const orderRow = async (id: number) =>
  (await selectRows<{ status: string; hold_reason: string | null }>(getPool(), "SELECT status, hold_reason FROM orders WHERE id = ?", [id]))[0]!;
const refundsOf = async (orderId: number) =>
  selectRows<{ status: string; amount_cents: number | string; requested_by: string }>(getPool(), "SELECT status, amount_cents, requested_by FROM refunds WHERE order_id = ? ORDER BY created_at, id", [orderId]);
const auditOf = async (orderId: number) =>
  (await selectRows<{ action: string; actor: string }>(getPool(), "SELECT action, actor FROM audit_log WHERE object_type = 'order' AND object_id = ? ORDER BY id", [String(orderId)])).filter((a) => a.actor === actor).map((a) => a.action);
const attentionFor = async (orderId: number) => (await attentionItems(getPool(), new Date())).filter((i) => i.orderId === orderId);

describe("what asks for attention", () => {
  it("a different amount: the order is held, and that is on the list until it is solved", async () => {
    const o = await newOrder();
    mollie.overrideAmount = money(100);
    await startPayment({ orderId: o.orderId, ...urls, now: new Date() }, mollie);
    const tr = mollie.idOfOrder(o.orderId);
    mollie.setStatus(tr, "paid");
    await handleWebhook(tr, mollie);
    expect(await attentionFor(o.orderId)).toEqual([{ kind: "hold", orderId: o.orderId, reference: o.reference, status: "PENDING_PAYMENT", holdReason: "AMOUNT_MISMATCH" }]);
    // No button yet for this one (a question for the owner): the page says so.
    expect(adminOptions((await readAdminOrder(getPool(), o.orderId))!)).toMatchObject({ heldUnpaid: true, cancel: null, releaseHold: false, refundPayments: [] });
  });

  it("paid at Mollie after the order expired here: on the list, with what Mollie said — no button yet", async () => {
    const now = new Date();
    const o = await newOrder(now);
    await startPayment({ orderId: o.orderId, ...urls, now }, mollie);
    const tr = mollie.idOfOrder(o.orderId);
    mollie.setStatus(tr, "expired");
    await expireUnpaidOrders(mollie, new Date(now.getTime() + SNAPSHOT_VALID_MS + 60_000));
    mollie.setStatus(tr, "paid"); // a bank that is very late
    await handleWebhook(tr, mollie);
    // The payment machine has no EXPIRED → PAID (docs/STATE_MACHINES.md): it stays EXPIRED here.
    expect(await attentionFor(o.orderId)).toEqual([
      { kind: "paid-late", orderId: o.orderId, reference: o.reference, status: "CANCELLED", paymentId: expect.any(String), recordedAs: "EXPIRED", amount: money(2445) },
    ]);
    expect(adminOptions((await readAdminOrder(getPool(), o.orderId))!)).toMatchObject({ paidLate: true, cancel: null, refundPayments: [] });
  });

  it("a second payment on a paid order: paid back on its own, once — and then the line is gone", async () => {
    const o = await paidOrder();
    // A second payment for the same order (another tab), paid at Mollie: € 24,45.
    const second = await mollie.createPayment({ key: randomUUID(), amount: money(2445), description: "x", redirectUrl: urls.redirectUrl, webhookUrl: null, locale: "nl", metadata: { orderId: o.orderId, paymentId: "x" } });
    mollie.setStatus(second.id, "paid");
    const paymentId = randomUUID();
    await getPool().query(
      "INSERT INTO payments (id, order_id, provider, status, amount_cents, currency, provider_payment_id, created_at) VALUES (?, ?, 'mollie', 'PAID', 2445, 'EUR', ?, NOW(3) + INTERVAL 1 SECOND)",
      [paymentId, o.orderId, second.id],
    );
    expect(await attentionFor(o.orderId)).toEqual([{ kind: "paid-not-accepted", orderId: o.orderId, reference: o.reference, status: "PAID", paymentId, open: money(2445) }]);
    expect(adminOptions((await readAdminOrder(getPool(), o.orderId))!).refundPayments).toEqual([{ paymentId, open: money(2445) }]);
    // The payment the order took is never paid back on its own.
    const taken = (await readAdminOrder(getPool(), o.orderId))!.payments[0]!.id;
    expect(await refundPayment({ orderId: o.orderId, paymentId: taken, expectedRefundCents: 2445, reason: "fout", actor }, mollie)).toEqual({ ok: false, error: "not-allowed" });

    expect(await refundPayment({ orderId: o.orderId, paymentId, expectedRefundCents: 2445, reason: "dubbel betaald", actor }, mollie)).toEqual({ ok: true, refund: "sent" });
    expect(await refundsOf(o.orderId)).toEqual([{ status: "SUBMITTED", amount_cents: 2445, requested_by: actor }]);
    expect(await attentionFor(o.orderId)).toEqual([]);
    expect(await auditOf(o.orderId)).toEqual(["refund.requested"]);
    expect((await orderRow(o.orderId)).status).toBe("PAID");
    // A second click: nothing left, so the amount on the page is no longer true.
    expect(await refundPayment({ orderId: o.orderId, paymentId, expectedRefundCents: 2445, reason: "nog eens", actor }, mollie)).toEqual({ ok: false, error: "amount-changed" });
    expect(await refundsOf(o.orderId)).toHaveLength(1);
  });
});

describe("cancel and refund (PAID → CANCELLED by the admin)", () => {
  it("cancels, records the whole € 24,45 back and sends it to Mollie, with audit lines", async () => {
    const o = await paidOrder();
    expect(adminOptions((await readAdminOrder(getPool(), o.orderId))!).cancel).toEqual({ refund: money(2445) });
    expect(await cancelAndRefund({ orderId: o.orderId, expectedRefundCents: 2445, reason: "klant belde: dubbel besteld", actor }, mollie)).toEqual({ ok: true, refund: "sent" });
    expect((await orderRow(o.orderId)).status).toBe("CANCELLED");
    expect(await refundsOf(o.orderId)).toEqual([{ status: "SUBMITTED", amount_cents: 2445, requested_by: actor }]);
    expect(await auditOf(o.orderId)).toEqual(["order.cancelled", "refund.requested"]);
    // A second click (another tab): refused, and no second refund.
    expect(await cancelAndRefund({ orderId: o.orderId, expectedRefundCents: 2445, reason: "nog eens", actor }, mollie)).toEqual({ ok: false, error: "not-allowed" });
    expect(await refundsOf(o.orderId)).toHaveLength(1);
  });

  it("refuses when the amount differs from the confirmation, and changes nothing", async () => {
    const o = await paidOrder();
    expect(await cancelAndRefund({ orderId: o.orderId, expectedRefundCents: 2400, reason: "klant belde", actor }, mollie)).toEqual({ ok: false, error: "amount-changed" });
    expect(await orderRow(o.orderId)).toEqual({ status: "PAID", hold_reason: null });
    expect(await refundsOf(o.orderId)).toEqual([]);
    expect(await auditOf(o.orderId)).toEqual([]);
  });

  it("refuses without a reason, and changes nothing", async () => {
    const o = await paidOrder();
    expect(await cancelAndRefund({ orderId: o.orderId, expectedRefundCents: 2445, reason: " ", actor }, mollie)).toEqual({ ok: false, error: "reason-required" });
    expect((await orderRow(o.orderId)).status).toBe("PAID");
  });

  it("without a payment key the refund is recorded and waits for reconciliation", async () => {
    const o = await paidOrder();
    expect(await cancelAndRefund({ orderId: o.orderId, expectedRefundCents: 2445, reason: "klant belde", actor }, null)).toEqual({ ok: true, refund: "queued" });
    expect(await refundsOf(o.orderId)).toEqual([{ status: "REQUESTED", amount_cents: 2445, requested_by: actor }]);
  });
});

describe("a chargeback hold: the admin chooses", () => {
  async function chargedBack() {
    const o = await paidOrder();
    mollie.chargeBack(o.tr);
    await handleWebhook(o.tr, mollie);
    expect(await orderRow(o.orderId)).toEqual({ status: "PAID", hold_reason: "CHARGEBACK" });
    return o;
  }

  it("lift the hold, with a reason in the audit log; a stale page is refused", async () => {
    const o = await chargedBack();
    expect(await releaseHold({ orderId: o.orderId, expectedHold: "AMOUNT_MISMATCH", reason: "verkeerde hold", actor })).toEqual({ ok: false, error: "changed" });
    expect(await releaseHold({ orderId: o.orderId, expectedHold: "CHARGEBACK", reason: "klant heeft opnieuw betaald via de bank", actor })).toEqual({ ok: true, refund: "none" });
    expect(await orderRow(o.orderId)).toEqual({ status: "PAID", hold_reason: null });
    expect(await auditOf(o.orderId)).toEqual(["order.hold-released"]);
    expect(await releaseHold({ orderId: o.orderId, expectedHold: "CHARGEBACK", reason: "nog eens", actor })).toEqual({ ok: false, error: "changed" });
  });

  it("or cancel: the money is back with the customer already, so nothing is refunded", async () => {
    const o = await chargedBack();
    expect(await cancelAndRefund({ orderId: o.orderId, expectedRefundCents: 0, reason: "chargeback: niet leveren", actor }, mollie)).toEqual({ ok: true, refund: "none" });
    expect(await orderRow(o.orderId)).toEqual({ status: "CANCELLED", hold_reason: null });
    expect(await refundsOf(o.orderId)).toEqual([]);
    expect(await auditOf(o.orderId)).toEqual(["order.hold-released", "order.cancelled"]);
  });
});

describe("the order list and search", () => {
  it("a paid order is to do, oldest first; found by its number and by the e-mail address", async () => {
    const email = `zoek-${randomUUID().slice(0, 8)}@example.nl`;
    const o = await newOrder(new Date(), email);
    const rows = await searchOrders(getPool(), email.toUpperCase());
    expect(rows!.map((r) => r.reference)).toEqual([o.reference]);
    expect((await searchOrders(getPool(), o.reference))!.map((r) => r.id)).toEqual([o.orderId]);
    const waiting = await listOrders(getPool(), "wacht-op-betaling", 1);
    expect(waiting.total).toBeGreaterThan(0);
    expect(waiting.rows.every((r) => r.status === "PENDING_PAYMENT" || r.status === "PAYMENT_FAILED")).toBe(true);
    const todo = await listOrders(getPool(), "te-doen", 1);
    const ids = todo.rows.map((r) => r.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });
});
