// Sending the mail in the outbox against the test database, with a stand-in
// for the mail server (no real server in tests, .claude/rules/testen.md):
// at least once, marked SENT only after the server took it, waiting longer
// after each failure, FAILED and on the dashboard in the end (docs/MAIL.md §
// Als het misgaat, docs/IDEMPOTENCY.md § Mail).

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resendMail } from "@/lib/admin/order-actions";
import { attentionItems } from "@/lib/admin/orders";
import { getPool, selectRows } from "@/lib/db";
import type { MailConfig } from "@/lib/mail/config";
import type { MailSender, OutgoingMail, SendResult } from "@/lib/mail/transport";
import { MAX_ATTEMPTS, sendDueMail } from "@/lib/mail/worker";
import { placeOrder } from "@/lib/orders";
import { SNAPSHOT_VALID_MS } from "@/lib/orders/states";
import { findOrderIdByToken } from "@/lib/orders/store";
import { expireUnpaidOrders, handleWebhook, startPayment } from "@/lib/payments";
import { FakeMollie } from "./fake-mollie";

afterAll(async () => {
  await getPool().end();
});

/** Takes every mail, or answers as told for mails about one order number. */
class FakeSmtp implements MailSender {
  sent: OutgoingMail[] = [];
  answers = new Map<string, SendResult["kind"]>();
  private n = 0;
  async send(mail: OutgoingMail): Promise<SendResult> {
    const steer = [...this.answers].find(([ref]) => mail.subject.includes(ref))?.[1];
    if (steer === "failed") return { kind: "failed", error: "ECONNECTION" };
    if (steer === "refused") return { kind: "refused", error: "EENVELOPE 550" };
    this.sent.push(mail);
    return { kind: "sent", messageId: `<test-${++this.n}@wonzo.nl>` };
  }
  async verify() {
    return true;
  }
  about(reference: string) {
    return this.sent.filter((m) => m.subject.includes(reference));
  }
}

let mollie: FakeMollie;
let smtp: FakeSmtp;

// Every other integration test leaves paid orders, and so confirmations, in the outbox that
// nobody sends. The worker takes the oldest first (as it should), so drain those once here:
// otherwise the mail of these tests waits behind hundreds of others. Some are due only in
// the future (those tests run on a clock hours or a day ahead), and this file moves its
// clock days ahead: drain as of a month from now.
beforeAll(async () => {
  const sink = new FakeSmtp();
  const later = new Date(Date.now() + 30 * 86_400_000);
  for (let round = 0; round < 100; round++) {
    const r = await sendDueMail(sink, live, later, 500);
    if (r.sent + r.failed + r.skipped === 0) break;
  }
}, 300_000);

beforeEach(() => {
  mollie = new FakeMollie();
  smtp = new FakeSmtp();
});

const live: MailConfig = { host: "smtp.test", port: 465, secure: true, user: "u", password: "p", from: "WonZo <info@wonzo.nl>", ordersTo: "eigenaar@example.nl", redirectTo: null, production: true };
const urls = { redirectUrl: "https://wonzo.nl/bestelling/x", webhookUrl: "https://wonzo.nl/api/payments/webhook" };
const lines = [{ source: "bigbuy", productId: "1300106", quantity: 1 }];

async function paidOrder(now = new Date()) {
  const email = `mail-${randomUUID().slice(0, 8)}@example.nl`;
  const customer = { email, phone: "0612345678", firstName: "Zoë", lastName: "Çelik", street: "Teststraat", houseNumber: "1", postcode: "1234 AB", city: "Arnhem" };
  const r = await placeOrder({ checkoutAttemptId: randomUUID(), locale: "nl", lines, customer }, now);
  if (r.kind !== "placed") throw new Error(r.kind);
  await startPayment({ orderId: r.orderId, ...urls, now }, mollie);
  const tr = mollie.idOfOrder(r.orderId);
  mollie.setStatus(tr, "paid");
  await handleWebhook(tr, mollie, now);
  return { orderId: r.orderId, reference: r.reference, email };
}
const mailRows = async (orderId: number) =>
  selectRows<{ kind: string; status: string; attempts: number | string; message_id: string | null }>(
    getPool(),
    "SELECT kind, status, attempts, message_id FROM outbox WHERE kind IN ('order-confirmation', 'admin-new-order', 'order-cancelled', 'admin-alert') AND JSON_VALUE(payload, '$.orderId') = ? ORDER BY id",
    [orderId],
  );

describe("on payment: the confirmation to the customer and the notification to the owner", () => {
  it("sends both once, marks them SENT with the server's id, and the link in the mail opens the order", async () => {
    const o = await paidOrder();
    await sendDueMail(smtp, live, new Date());
    const mails = smtp.about(o.reference);
    expect(mails.map((m) => m.to).sort()).toEqual([o.email, "eigenaar@example.nl"].sort());
    expect(await mailRows(o.orderId)).toEqual([
      { kind: "order-confirmation", status: "SENT", attempts: 0, message_id: expect.stringMatching(/^<test-/) },
      { kind: "admin-new-order", status: "SENT", attempts: 0, message_id: expect.stringMatching(/^<test-/) },
    ]);
    const confirmation = mails.find((m) => m.to === o.email)!;
    expect(confirmation.replyTo).toBe("info@wonzo.nl");
    const token = /\/bestelling\/([A-Za-z0-9_-]{43})/.exec(confirmation.text)![1]!;
    expect(await findOrderIdByToken(getPool(), token)).toBe(o.orderId);
    // A second run sends nothing again.
    await sendDueMail(smtp, live, new Date());
    expect(smtp.about(o.reference)).toHaveLength(2);
  });

  it("outside production everything goes to the test address — and without one, nothing goes out", async () => {
    const o = await paidOrder();
    await sendDueMail(smtp, { ...live, production: false, redirectTo: null }, new Date());
    expect(smtp.about(o.reference)).toEqual([]);
    expect((await mailRows(o.orderId)).map((r) => r.status)).toEqual(["PENDING", "PENDING"]);
    await sendDueMail(smtp, { ...live, production: false, redirectTo: "test@wonzo.nl" }, new Date());
    expect(smtp.about(o.reference).map((m) => m.to)).toEqual(["test@wonzo.nl", "test@wonzo.nl"]);
  });
});

describe("when it does not go out", () => {
  it("a temporary failure waits and tries again; after the last try it is FAILED and on the dashboard; the owner sends it again", async () => {
    const o = await paidOrder();
    smtp.answers.set(o.reference, "failed");
    let now = new Date();
    await sendDueMail(smtp, live, now);
    expect((await mailRows(o.orderId)).map((r) => [r.status, Number(r.attempts)])).toEqual([["PENDING", 1], ["PENDING", 1]]);
    // Not before the wait is over.
    await sendDueMail(smtp, live, new Date(now.getTime() + 30_000));
    expect(Number((await mailRows(o.orderId))[0]!.attempts)).toBe(1);
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      now = new Date(now.getTime() + 13 * 3_600_000);
      await sendDueMail(smtp, live, now);
    }
    expect((await mailRows(o.orderId)).map((r) => [r.status, Number(r.attempts)])).toEqual([["FAILED", MAX_ATTEMPTS], ["FAILED", MAX_ATTEMPTS]]);
    expect((await attentionItems(getPool(), now)).filter((i) => i.orderId === o.orderId).map((i) => i.kind)).toEqual(["mail-failed", "mail-failed"]);

    const [first] = await selectRows<{ id: number | string }>(getPool(), "SELECT id FROM outbox WHERE kind = 'order-confirmation' AND JSON_VALUE(payload, '$.orderId') = ?", [o.orderId]);
    smtp.answers.delete(o.reference);
    expect(await resendMail({ orderId: o.orderId, outboxId: Number(first!.id), reason: "adres gecontroleerd", actor: "admin:test", now })).toEqual({ ok: true, refund: "none" });
    await sendDueMail(smtp, live, now);
    expect(smtp.about(o.reference).map((m) => m.to)).toEqual([o.email]);
    // Another order's mail is not this order's to send again.
    expect(await resendMail({ orderId: o.orderId + 1_000_000, outboxId: Number(first!.id), reason: "verkeerd", actor: "admin:test", now })).toEqual({ ok: false, error: "changed" });
  });

  it("a refusal for good (an address that does not exist) is FAILED at once", async () => {
    const o = await paidOrder();
    smtp.answers.set(o.reference, "refused");
    await sendDueMail(smtp, live, new Date());
    expect((await mailRows(o.orderId)).map((r) => r.status)).toEqual(["FAILED", "FAILED"]);
  });

  it("an unpaid order that simply expired gets no cancellation mail", async () => {
    const now = new Date();
    const r = await placeOrder({ checkoutAttemptId: randomUUID(), locale: "nl", lines, customer: { email: "weg@example.nl", phone: "0612345678", firstName: "A", lastName: "B", street: "C", houseNumber: "1", postcode: "1234 AB", city: "D" } }, now);
    if (r.kind !== "placed") throw new Error(r.kind);
    await startPayment({ orderId: r.orderId, ...urls, now }, mollie);
    mollie.setStatus(mollie.idOfOrder(r.orderId), "expired");
    await expireUnpaidOrders(mollie, new Date(now.getTime() + SNAPSHOT_VALID_MS + 60_000));
    await sendDueMail(smtp, live, new Date(now.getTime() + SNAPSHOT_VALID_MS + 61_000));
    expect(await mailRows(r.orderId)).toEqual([{ kind: "order-cancelled", status: "DONE", attempts: 0, message_id: null }]);
    expect(smtp.about(r.reference)).toEqual([]);
  });
});
