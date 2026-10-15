// Tracking and returns against the test database, with stand-ins for Mollie,
// BigBuy and the mail server (D-09, owner 2026-10-13; docs/RETOUREN.md,
// docs/STATE_MACHINES.md § Return). One order line, 2 × € 18,50 = € 37,00:
// under € 50, so € 5,95 shipping — the order is € 42,95 (D-13). The amounts
// are checked by hand in each test.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { attentionItems } from "@/lib/admin/orders";
import { getPool, selectRows, toDbTime } from "@/lib/db";
import { issueInvoice, issueReturnCreditNote } from "@/lib/invoices";
import { fromSnapshot } from "@/lib/invoices/document";
import type { MailConfig } from "@/lib/mail/config";
import type { MailSender, OutgoingMail, SendResult } from "@/lib/mail/transport";
import { sendDueMail } from "@/lib/mail/worker";
import { money } from "@/lib/money";
import { placeOrder, releaseClosedWindows } from "@/lib/orders";
import { CANCEL_WINDOW_MS } from "@/lib/orders/states";
import { markDelivered, runTracking, TRACKING_EVERY_MS } from "@/lib/orders/tracking";
import { handleWebhook, startPayment } from "@/lib/payments";
import { lookupReturn, receiveReturn, refundReturn, rejectReturn, requestReturn, settleReturns } from "@/lib/returns";
import { FakeBigBuy } from "./fake-bigbuy";
import { FakeMollie } from "./fake-mollie";

afterAll(async () => {
  await getPool().end();
});

let mollie: FakeMollie;
let bigbuy: FakeBigBuy;
const actor = "admin:test";
const urls = { redirectUrl: "https://wonzo.nl/bestelling/x", webhookUrl: "https://wonzo.nl/api/payments/webhook" };
const lines = [{ source: "bigbuy", productId: "1300106", quantity: 2 }];
const hours = (from: Date, n: number) => new Date(from.getTime() + n * 3_600_000);

// Purchase orders other tests left at the supplier are asked about too, oldest first. Ask
// about them all once, as of a month ahead, so they are not due again during this file.
beforeAll(async () => {
  const quiet = new FakeBigBuy();
  const later = new Date(Date.now() + 30 * 86_400_000);
  for (let round = 0; round < 200; round++) if ((await runTracking(quiet, later)).asked < 50) break;
}, 300_000);

beforeEach(() => {
  mollie = new FakeMollie();
  bigbuy = new FakeBigBuy();
});

/**
 * Paid, past the window, invoiced, and placed at the supplier: PURCHASED. The
 * purchase order is written here instead of through the purchasing round,
 * which handles what other tests left first (tests/integration/purchasing.test.ts tests it).
 */
async function purchased(now = new Date()) {
  const email = `retour-${randomUUID().slice(0, 8)}@example.nl`;
  const customer = { email, phone: "0612345678", firstName: "Test", lastName: "Retour", street: "Teststraat", houseNumber: "1", postcode: "1234 AB", city: "Arnhem" };
  const r = await placeOrder({ checkoutAttemptId: randomUUID(), locale: "nl", lines, customer }, now);
  if (r.kind !== "placed") throw new Error(r.kind);
  await startPayment({ orderId: r.orderId, ...urls, now }, mollie);
  const tr = mollie.idOfOrder(r.orderId);
  mollie.setStatus(tr, "paid");
  await handleWebhook(tr, mollie, now);
  const at = new Date(now.getTime() + CANCEL_WINDOW_MS + 60_000);
  await releaseClosedWindows(at);
  expect(await issueInvoice(r.orderId, at)).toBe("created");
  const supplierRef = String(Date.now()).slice(-9) + String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  const soId = randomUUID();
  await getPool().query(
    `INSERT INTO supplier_orders (id, order_id, source, reference, status, supplier_order_ref, expected_cost_cents, next_attempt_at, placed_at, created_at)
     VALUES (?, ?, 'bigbuy', ?, 'PLACED', ?, 0, ?, ?, ?)`,
    [soId, r.orderId, r.reference, supplierRef, toDbTime(at), toDbTime(at), toDbTime(at)],
  );
  await getPool().query("UPDATE orders SET status = 'PURCHASED' WHERE id = ? AND status = 'FULFILLMENT_PENDING'", [r.orderId]);
  const [inv] = await selectRows<{ number: string }>(getPool(), "SELECT number FROM invoices WHERE order_id = ? AND kind = 'invoice'", [r.orderId]);
  return { orderId: r.orderId, reference: r.reference, email, invoice: inv!.number, supplierRef, soId, at, total: Number((await selectRows<{ t: number }>(getPool(), "SELECT total_cents AS t FROM orders WHERE id = ?", [r.orderId]))[0]!.t) };
}
const orderRow = async (id: number) =>
  (await selectRows<{ status: string; shipped_at: string | null; delivered_at: string | null }>(getPool(), "SELECT status, shipped_at, delivered_at FROM orders WHERE id = ?", [id]))[0]!;
const outboxKinds = async (orderId: number) =>
  (await selectRows<{ kind: string }>(getPool(), "SELECT kind FROM outbox WHERE JSON_VALUE(payload, '$.orderId') = ? ORDER BY id", [orderId])).map((r) => r.kind);
const returnRow = async (orderId: number) =>
  (await selectRows<{ id: number | string; number: string; status: string; open_order_id: number | string | null; lines_cents: number | string; shipping_cents: number | string; refund_cents: number | string | null; refund_id: string | null }>(
    getPool(),
    "SELECT id, number, status, open_order_id, lines_cents, shipping_cents, refund_cents, refund_id FROM returns WHERE order_id = ? ORDER BY id DESC LIMIT 1",
    [orderId],
  ))[0]!;
const auditOf = async (orderId: number) =>
  (await selectRows<{ action: string }>(getPool(), "SELECT action FROM audit_log WHERE object_type = 'order' AND object_id = ? ORDER BY id", [String(orderId)])).map((a) => a.action);

describe("tracking: shipped, then delivered (the withdrawal window starts there)", () => {
  it("a parcel on its way: the purchase order and the order SHIPPED, the mail in the outbox; delivered later with the carrier's time", async () => {
    const o = await purchased();
    bigbuy.parcels.set(o.supplierRef, [{ trackingNumber: "ES1234567890", carrier: "GLS", statusText: "in transit", statusAt: null, delivered: false }]);
    expect(await runTracking(bigbuy, o.at)).toMatchObject({ shipped: 1, delivered: 0 });
    expect((await orderRow(o.orderId)).status).toBe("SHIPPED");
    expect(await outboxKinds(o.orderId)).toContain("order-shipped");
    // Asked again only after TRACKING_EVERY_MS.
    expect(bigbuy.trackingAsked.flat().filter((r) => r === o.supplierRef)).toHaveLength(1);
    await runTracking(bigbuy, hours(o.at, 1));
    expect(bigbuy.trackingAsked.flat().filter((r) => r === o.supplierRef)).toHaveLength(1);

    const arrived = new Date("2026-10-14T09:30:00Z");
    bigbuy.parcels.set(o.supplierRef, [{ trackingNumber: "ES1234567890", carrier: "GLS", statusText: "delivered", statusAt: arrived, delivered: true }]);
    const later = new Date(o.at.getTime() + TRACKING_EVERY_MS + 60_000);
    expect(await runTracking(bigbuy, later)).toMatchObject({ delivered: 1 });
    const row = await orderRow(o.orderId);
    expect(row.status).toBe("DELIVERED");
    expect(row.delivered_at?.startsWith("2026-10-14 09:30:00")).toBe(true);
    const [parcel] = await selectRows<{ tracking_number: string; delivered: number }>(getPool(), "SELECT tracking_number, delivered FROM shipments WHERE supplier_order_id = ?", [o.soId]);
    expect(parcel).toEqual({ tracking_number: "ES1234567890", delivered: 1 });
  });

  it("no answer from the supplier: nothing changes, and it is asked again within the hour", async () => {
    const o = await purchased();
    bigbuy.trackingUnknown = true;
    await runTracking(bigbuy, o.at);
    expect((await orderRow(o.orderId)).status).toBe("PURCHASED");
    bigbuy.trackingUnknown = false;
    bigbuy.parcels.set(o.supplierRef, [{ trackingNumber: "ES0000000001", carrier: null, statusText: null, statusAt: null, delivered: false }]);
    await runTracking(bigbuy, new Date(o.at.getTime() + 31 * 60_000));
    expect((await orderRow(o.orderId)).status).toBe("SHIPPED");
  });

  it("the admin marks it delivered (from PURCHASED, through SHIPPED), with a reason in the audit log; not on an unpurchased order", async () => {
    const o = await purchased();
    expect(await markDelivered({ orderId: o.orderId, reason: "klant meldt ontvangst", actor, now: o.at })).toEqual({ ok: true });
    const row = await orderRow(o.orderId);
    expect(row.status).toBe("DELIVERED");
    expect(row.delivered_at).not.toBeNull();
    expect(await auditOf(o.orderId)).toContain("order.delivered-marked");
    expect(await markDelivered({ orderId: o.orderId, reason: "nog eens", actor, now: o.at })).toEqual({ ok: false, error: "not-allowed" });
  });
});

describe("the return form: the address and the invoice number", () => {
  it("one answer for every miss; the right pair shows the lines without the address", async () => {
    const o = await purchased();
    expect(await lookupReturn({ email: "iemand@example.nl", invoice: o.invoice })).toEqual({ kind: "not-found" });
    expect(await lookupReturn({ email: o.email, invoice: "2099-99999" })).toEqual({ kind: "not-found" });
    const found = await lookupReturn({ email: o.email.toUpperCase(), invoice: o.invoice });
    expect(found.kind).toBe("found");
    if (found.kind !== "found") return;
    expect(found.form).toMatchObject({ reference: o.reference, invoice: o.invoice, lines: [{ lineNo: 1, bought: 2, returned: 0, unitPrice: money(1850) }] });
    expect(JSON.stringify(found.form)).not.toContain("Teststraat");
  });

  it("a return is made with its number and the amount from the frozen lines; one open return per order, also from two tabs at once", async () => {
    const o = await purchased();
    const key = { email: o.email, invoice: o.invoice };
    // One of two pieces back, no reason: € 18,50, no shipping (partial).
    const [a, b] = await Promise.all([requestReturn({ ...key, lines: [{ lineNo: 1, quantity: 1, reason: "none" }] }, o.at), requestReturn({ ...key, lines: [{ lineNo: 1, quantity: 1, reason: "none" }] }, o.at)]);
    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(["not-returnable", "requested"]);
    const r = await returnRow(o.orderId);
    expect(r).toMatchObject({ status: "REQUESTED", lines_cents: 1850, shipping_cents: 0 });
    expect(r.number).toMatch(/^R\d{4}-\d{5}$/);
    expect(Number(r.open_order_id)).toBe(o.orderId);
    expect(await outboxKinds(o.orderId)).toEqual(expect.arrayContaining(["return-requested", "admin-new-return"]));
    expect(await auditOf(o.orderId)).toContain("return.requested");
    expect(await lookupReturn(key)).toEqual({ kind: "not-returnable", why: "open-return" });
  });

  it("what the browser cannot do: more than was bought, a missing reason, an amount of its own", async () => {
    const o = await purchased();
    const key = { email: o.email, invoice: o.invoice };
    expect(await requestReturn({ ...key, lines: [{ lineNo: 1, quantity: 3, reason: "none" }] }, o.at)).toMatchObject({ kind: "invalid", lines: { 1: "quantity" } });
    expect(await requestReturn({ ...key, lines: [{ lineNo: 1, quantity: 1, reason: "" }] }, o.at)).toMatchObject({ kind: "invalid", lines: { 1: "reason" } });
    expect(await requestReturn({ ...key, lines: [] }, o.at)).toMatchObject({ kind: "invalid", error: "empty" });
    await requestReturn({ ...key, lines: [{ lineNo: 1, quantity: 1, reason: "none", lines_cents: 1 }] }, o.at);
    expect((await returnRow(o.orderId)).lines_cents).toBe(1850);
  });

  it("after 14 days from the delivery: no longer without a reason, still when defective", async () => {
    const o = await purchased();
    await getPool().query("UPDATE orders SET status = 'DELIVERED', delivered_at = ? WHERE id = ?", [toDbTime(new Date(o.at.getTime() - 20 * 86_400_000)), o.orderId]);
    const key = { email: o.email, invoice: o.invoice };
    expect(await requestReturn({ ...key, lines: [{ lineNo: 1, quantity: 1, reason: "none" }] }, o.at)).toMatchObject({ kind: "invalid", lines: { 1: "window" } });
    expect(await requestReturn({ ...key, lines: [{ lineNo: 1, quantity: 1, reason: "defect" }] }, o.at)).toMatchObject({ kind: "requested" });
  });

  it("a cancelled or held order: not through the form", async () => {
    const o = await purchased();
    await getPool().query("UPDATE orders SET hold_reason = 'CHARGEBACK' WHERE id = ?", [o.orderId]);
    expect(await lookupReturn({ email: o.email, invoice: o.invoice })).toEqual({ kind: "not-returnable", why: "hold" });
    await getPool().query("UPDATE orders SET hold_reason = NULL, status = 'CANCELLED' WHERE id = ?", [o.orderId]);
    expect(await lookupReturn({ email: o.email, invoice: o.invoice })).toEqual({ kind: "not-returnable", why: "status" });
  });
});

describe("the admin: received, then approved (all or part) or refused (D-09)", () => {
  async function requested(pieces = 2) {
    const o = await purchased();
    const r = await requestReturn({ email: o.email, invoice: o.invoice, lines: [{ lineNo: 1, quantity: pieces, reason: "none" }] }, o.at);
    if (r.kind !== "requested") throw new Error(r.kind);
    return { ...o, returnId: Number((await returnRow(o.orderId)).id), number: r.number };
  }

  it("everything back with a deduction of € 5,00: € 42,95 − € 5,00 = € 37,95, refunded, then REFUNDED, the mail and a credit note of exactly − € 37,95", async () => {
    // 2 × € 18,50 + € 5,95 shipping (the whole order comes back) = € 42,95.
    const o = await requested(2);
    expect(o.total).toBe(4295);
    expect(await returnRow(o.orderId)).toMatchObject({ lines_cents: 3700, shipping_cents: 595 });
    // Not before it was received.
    expect(await refundReturn({ returnId: o.returnId, expectedMaxCents: 4295, refundCents: 4295, deductionReason: null, actor }, mollie)).toEqual({ ok: false, error: "not-allowed" });
    expect(await receiveReturn({ returnId: o.returnId, expectedStatus: "REQUESTED", actor })).toEqual({ ok: true, refund: "none" });
    expect(await receiveReturn({ returnId: o.returnId, expectedStatus: "REQUESTED", actor })).toEqual({ ok: false, error: "changed" });
    // Refused, not cut off: above the maximum, below one cent, less without a reason, a stale page.
    expect(await refundReturn({ returnId: o.returnId, expectedMaxCents: 4295, refundCents: 4296, deductionReason: null, actor }, mollie)).toEqual({ ok: false, error: "amount-range" });
    expect(await refundReturn({ returnId: o.returnId, expectedMaxCents: 4295, refundCents: 0, deductionReason: null, actor }, mollie)).toEqual({ ok: false, error: "amount-range" });
    expect(await refundReturn({ returnId: o.returnId, expectedMaxCents: 4295, refundCents: 3795, deductionReason: " ", actor }, mollie)).toEqual({ ok: false, error: "reason-required" });
    expect(await refundReturn({ returnId: o.returnId, expectedMaxCents: 3700, refundCents: 3700, deductionReason: null, actor }, mollie)).toEqual({ ok: false, error: "amount-changed" });

    mollie.next.refundStatus = "refunded";
    expect(await refundReturn({ returnId: o.returnId, expectedMaxCents: 4295, refundCents: 3795, deductionReason: "krassen op het blad", actor }, mollie)).toEqual({ ok: true, refund: "sent" });
    const r = await returnRow(o.orderId);
    expect(r).toMatchObject({ status: "REFUNDING", refund_cents: 3795 });
    const [refund] = await selectRows<{ status: string; amount_cents: number; return_id: number | string }>(getPool(), "SELECT status, amount_cents, return_id FROM refunds WHERE id = ?", [r.refund_id]);
    expect(refund).toMatchObject({ status: "SUCCEEDED", amount_cents: 3795 });
    expect(Number(refund!.return_id)).toBe(o.returnId);
    // A second click: the return has moved on.
    expect(await refundReturn({ returnId: o.returnId, expectedMaxCents: 4295, refundCents: 3795, deductionReason: "nog eens", actor }, mollie)).toEqual({ ok: false, error: "changed" });

    await settleReturns(o.at);
    expect(await returnRow(o.orderId)).toMatchObject({ status: "REFUNDED", open_order_id: null });
    expect(await outboxKinds(o.orderId)).toContain("return-refunded");
    expect(await auditOf(o.orderId)).toEqual(expect.arrayContaining(["return.received", "return.refund-requested", "refund.requested", "return.refunded"]));

    expect(await issueReturnCreditNote(o.returnId, o.at)).toBe("created");
    expect(await issueReturnCreditNote(o.returnId, o.at)).toBe("exists");
    const [credit] = await selectRows<{ number: string; total_incl_cents: number; snapshot: unknown }>(getPool(), "SELECT number, total_incl_cents, snapshot FROM invoices WHERE return_id = ?", [o.returnId]);
    expect(credit!.number).toMatch(/^C\d{4}-\d{5}$/);
    expect(credit!.total_incl_cents).toBe(-3795);
    const doc = fromSnapshot(typeof credit!.snapshot === "string" ? JSON.parse(credit!.snapshot) : credit!.snapshot);
    expect(doc.returnNumber).toBe(o.number);
    // − 2 × € 18,50 and − € 5,95 shipping, + € 5,00 deduction.
    expect(doc.lines.map((l) => [l.name === "Waardevermindering" ? "deduction" : "piece", l.quantity, l.totalIncl.amount])).toEqual([["piece", -2, -3700], ["deduction", 1, 500]]);
    expect(doc.shipping?.incl.amount).toBe(-595);
    // Nothing more to return: the form says so.
    expect(await lookupReturn({ email: o.email, invoice: o.invoice })).toEqual({ kind: "not-returnable", why: "nothing-left" });
  });

  it("refused with a reason: closed, the customer gets the mail, and a new return can be made", async () => {
    const o = await requested(1);
    expect(await rejectReturn({ returnId: o.returnId, expectedStatus: "REQUESTED", reason: "", actor })).toEqual({ ok: false, error: "reason-required" });
    expect(await rejectReturn({ returnId: o.returnId, expectedStatus: "REQUESTED", reason: "buiten de termijn aangemeld", actor })).toEqual({ ok: true, refund: "none" });
    expect(await returnRow(o.orderId)).toMatchObject({ status: "REJECTED", open_order_id: null });
    expect(await outboxKinds(o.orderId)).toContain("return-rejected");
    expect((await lookupReturn({ email: o.email, invoice: o.invoice })).kind).toBe("found");
  });

  it("a refund the provider refuses: back to RECEIVED, on the dashboard, and the admin can pay back again", async () => {
    const o = await requested(1);
    await receiveReturn({ returnId: o.returnId, expectedStatus: "REQUESTED", actor });
    mollie.next.refund = "refuse";
    expect(await refundReturn({ returnId: o.returnId, expectedMaxCents: 1850, refundCents: 1850, deductionReason: null, actor }, mollie)).toEqual({ ok: true, refund: "sent" });
    await settleReturns(o.at);
    expect(await returnRow(o.orderId)).toMatchObject({ status: "RECEIVED", refund_id: null, refund_cents: null });
    expect((await attentionItems(getPool(), o.at)).filter((i) => i.orderId === o.orderId).map((i) => i.kind)).toEqual(expect.arrayContaining(["refund-failed", "return-waiting"]));
    mollie.next.refundStatus = "refunded";
    expect(await refundReturn({ returnId: o.returnId, expectedMaxCents: 1850, refundCents: 1850, deductionReason: null, actor }, mollie)).toEqual({ ok: true, refund: "sent" });
    await settleReturns(o.at);
    expect((await returnRow(o.orderId)).status).toBe("REFUNDED");
  });
});

describe("the mails of a return reach the customer and the owner", () => {
  /** Takes every mail; the test looks only at the ones about its own return. */
  class Sink implements MailSender {
    sent: OutgoingMail[] = [];
    async send(mail: OutgoingMail): Promise<SendResult> {
      this.sent.push(mail);
      return { kind: "sent", messageId: `<r-${this.sent.length}@wonzo.nl>` };
    }
    async verify() {
      return true;
    }
  }
  const live: MailConfig = { host: "smtp.test", port: 465, secure: true, user: "u", password: "p", from: "WonZo <info@wonzo.nl>", ordersTo: "eigenaar@example.nl", redirectTo: null, production: true };

  it("registered: to the customer with the steps and the address, and a short note to the owner", async () => {
    const o = await purchased();
    const r = await requestReturn({ email: o.email, invoice: o.invoice, lines: [{ lineNo: 1, quantity: 1, reason: "damaged" }] }, o.at);
    if (r.kind !== "requested") throw new Error(r.kind);
    const sink = new Sink();
    // The worker takes the oldest first: send until this return's mails are out.
    for (let round = 0; round < 20 && sink.sent.filter((m) => m.subject.includes(r.number)).length < 2; round++) await sendDueMail(sink, live, hours(o.at, 1), 500);
    const mine = sink.sent.filter((m) => m.subject.includes(r.number));
    const customer = mine.find((m) => m.to === o.email)!;
    expect(customer.subject).toBe(`Retour ${r.number} aangemeld`);
    expect(customer.text).toContain("Thaliastraat 267");
    expect(customer.text).toContain("Beschadigd aangekomen");
    expect(mine.find((m) => m.to === "eigenaar@example.nl")!.subject).toBe(`Nieuwe retour ${r.number} bij ${o.reference}`);
  }, 300_000);
});
