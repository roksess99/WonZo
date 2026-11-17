// Returns, tracking and the audit log without a database (D-09, owner
// 2026-10-13; docs/RETOUREN.md). The amounts are checked by hand:
//   order: 2 × € 18,50 (line 1) and 1 × € 99,99 with own shipping € 17,97 (line 2), normal shipping € 0
//   1 of line 1, no reason:            € 18,50, no shipping                       = € 18,50
//   line 2, damaged (shop's fault):    € 99,99 + € 17,97 large shipping           = € 117,96
//   everything, no reason:             € 37,00 + € 99,99 + € 17,97                = € 154,96
//   everything after line 2 came back: € 37,00 + (€ 17,97 − € 17,97 counted then) = € 37,00
//   the € 24,45 order (1 × € 18,50 + € 5,95), all back:                           = € 24,45

import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }), cookies: async () => ({ get: () => undefined }) }));

import { markDeliveredAction } from "@/app/beheer/bestellingen/actions";
import { receiveReturnAction, refundReturnAction, rejectReturnAction } from "@/app/beheer/retouren/actions";
import { POST as returnsRoute } from "@/app/api/returns/route";
import { auditChange } from "@/components/admin/audit";
import { isDeliveredStatus, parseCarriers, parseSupplierTime, parseTracking } from "@/lib/catalog/bigbuy/ordering";
import { orderShipped, returnRefunded } from "@/lib/mail/after-sale";
import { getMessages } from "@/lib/i18n/messages";
import { formatMoney, money } from "@/lib/money";
import { parseEuroInput, quoteReturn, withdrawalOpen, type ReturnableOrder } from "@/lib/returns/amount";
import { parseReturnKey, parseReturnLines, returnNumber } from "@/lib/returns";
import { canTransitionReturn } from "@/lib/returns/states";

const now = new Date("2026-10-13T12:00:00Z");
const order = (o: Partial<ReturnableOrder> = {}): ReturnableOrder => ({
  lines: [
    { lineNo: 1, bought: 2, returned: 0, unitPrice: money(1850), largeShipping: null },
    { lineNo: 2, bought: 1, returned: 0, unitPrice: money(9999), largeShipping: money(1797) },
  ],
  shippingStandard: money(0),
  earlierShipping: money(0),
  deliveredAt: null,
  ...o,
});

describe("what a return gives back at most (docs/RETOUREN.md § De vier redenen)", () => {
  it("part of the order without a reason: the pieces, no shipping — € 18,50", () => {
    expect(quoteReturn(order(), [{ lineNo: 1, quantity: 1, reason: "none" }], now)).toEqual({ ok: true, lines: money(1850), shipping: money(0), total: money(1850), wholeOrder: false });
  });
  it("a large item that arrived damaged: its own shipping back too — € 117,96", () => {
    expect(quoteReturn(order(), [{ lineNo: 2, quantity: 1, reason: "damaged" }], now)).toMatchObject({ ok: true, lines: money(9999), shipping: money(1797), total: money(11796) });
  });
  it("the same large item without a reason, while the rest stays: no shipping", () => {
    expect(quoteReturn(order(), [{ lineNo: 2, quantity: 1, reason: "none" }], now)).toMatchObject({ ok: true, shipping: money(0), total: money(9999) });
  });
  it("everything back: all shipping of the order — € 154,96", () => {
    const q = quoteReturn(order(), [{ lineNo: 1, quantity: 2, reason: "none" }, { lineNo: 2, quantity: 1, reason: "none" }], now);
    expect(q).toEqual({ ok: true, lines: money(13699), shipping: money(1797), total: money(15496), wholeOrder: true });
  });
  it("the rest after an earlier return: shipping that one counted is not given twice — € 37,00", () => {
    const after = order({ lines: [order().lines[0]!, { ...order().lines[1]!, returned: 1 }], earlierShipping: money(1797) });
    expect(quoteReturn(after, [{ lineNo: 1, quantity: 2, reason: "none" }], now)).toEqual({ ok: true, lines: money(3700), shipping: money(0), total: money(3700), wholeOrder: true });
  });
  it("the € 24,45 order, all back: € 18,50 + € 5,95", () => {
    const small: ReturnableOrder = { lines: [{ lineNo: 1, bought: 1, returned: 0, unitPrice: money(1850), largeShipping: null }], shippingStandard: money(595), earlierShipping: money(0), deliveredAt: null };
    expect(quoteReturn(small, [{ lineNo: 1, quantity: 1, reason: "none" }], now)).toMatchObject({ ok: true, total: money(2445) });
  });
  it("out of range is refused, never cut off: more than is left, below one, twice the same line, an unknown line", () => {
    expect(quoteReturn(order(), [{ lineNo: 1, quantity: 3, reason: "none" }], now)).toEqual({ ok: false, error: "lines", lines: { 1: "quantity" } });
    expect(quoteReturn(order(), [{ lineNo: 1, quantity: -1, reason: "none" }], now)).toEqual({ ok: false, error: "lines", lines: { 1: "quantity" } });
    expect(quoteReturn(order(), [{ lineNo: 1, quantity: 1, reason: "none" }, { lineNo: 1, quantity: 1, reason: "none" }], now)).toMatchObject({ ok: false, lines: { 1: "quantity" } });
    expect(quoteReturn(order(), [{ lineNo: 9, quantity: 1, reason: "none" }], now)).toMatchObject({ ok: false, lines: { 9: "quantity" } });
    expect(quoteReturn(order(), [{ lineNo: 1, quantity: 0, reason: "none" }], now)).toEqual({ ok: false, error: "empty", lines: {} });
  });
  it("a reason is needed for every chosen line", () => {
    expect(quoteReturn(order(), [{ lineNo: 1, quantity: 1, reason: "nope" as never }], now)).toEqual({ ok: false, error: "lines", lines: { 1: "reason" } });
  });
  it("without a reason only within 14 days of the delivery; wrong, damaged or defect always (legal guarantee)", () => {
    const delivered = order({ deliveredAt: new Date("2026-10-01T10:00:00Z") });
    expect(withdrawalOpen(delivered.deliveredAt, new Date("2026-10-15T10:00:00Z"))).toBe(true);
    const late = new Date("2026-10-15T10:00:01Z");
    expect(quoteReturn(delivered, [{ lineNo: 1, quantity: 1, reason: "none" }], late)).toEqual({ ok: false, error: "lines", lines: { 1: "window" } });
    expect(quoteReturn(delivered, [{ lineNo: 1, quantity: 1, reason: "defect" }], late)).toMatchObject({ ok: true, total: money(1850) });
    // Delivery not known yet: the form stays open.
    expect(withdrawalOpen(null, late)).toBe(true);
  });
});

describe("what the form and the admin may send", () => {
  it("an amount the admin typed, exactly to cents — anything else refused", () => {
    expect(["12,50", "12.5", "12", "€ 24,45", " 0,01 "].map(parseEuroInput)).toEqual([1250, 1250, 1200, 2445, 1]);
    for (const bad of ["-5", "1,234", "abc", "", "12,5,0", "1e3"]) expect(parseEuroInput(bad)).toBeNull();
    expect(parseEuroInput(12)).toBeNull();
  });
  it("the two keys of the form: an address and an invoice number, normalised", () => {
    expect(parseReturnKey({ email: " Klant@Example.NL ", invoice: " 2026-00042 " })).toEqual({ email: "klant@example.nl", invoice: "2026-00042" });
    for (const bad of [{ email: "klant", invoice: "2026-00042" }, { email: "a@b.nl", invoice: "C2026-00001" }, { email: "a@b.nl", invoice: "42" }, {}]) expect(parseReturnKey(bad)).toBeNull();
  });
  it("lines from the browser: only numbers and a reason; never an amount, at most 50", () => {
    expect(parseReturnLines([{ lineNo: 1, quantity: 2, reason: "none", amount: 100 }])).toEqual([{ lineNo: 1, quantity: 2, reason: "none" }]);
    expect(parseReturnLines([{ lineNo: "1", quantity: 2, reason: "none" }])).toBeNull();
    expect(parseReturnLines("x")).toBeNull();
    expect(parseReturnLines(Array.from({ length: 51 }, () => ({ lineNo: 1, quantity: 1, reason: "none" })))).toBeNull();
  });
  it("numbers per year: R2026-00001", () => {
    expect(returnNumber(2026, 1)).toBe("R2026-00001");
  });
});

describe("the return state machine (docs/STATE_MACHINES.md § Return)", () => {
  it("the admin judges the product before paying back (D-09)", () => {
    expect(canTransitionReturn("REQUESTED", "RECEIVED", "admin")).toBe(true);
    expect(canTransitionReturn("RECEIVED", "REFUNDING", "admin")).toBe(true);
    expect(canTransitionReturn("REQUESTED", "REFUNDING", "admin")).toBe(false);
    expect(canTransitionReturn("REQUESTED", "RECEIVED", "customer")).toBe(false);
  });
  it("refunded only by the system, after the provider confirmed; a failed refund goes back to RECEIVED", () => {
    expect(canTransitionReturn("REFUNDING", "REFUNDED", "admin")).toBe(false);
    expect(canTransitionReturn("REFUNDING", "REFUNDED", "system")).toBe(true);
    expect(canTransitionReturn("REFUNDING", "RECEIVED", "system")).toBe(true);
    expect(canTransitionReturn("REFUNDED", "RECEIVED", "system")).toBe(false);
  });
});

describe("BigBuy's tracking at the edge (doc.json, OrderTrackingDoc)", () => {
  const carriers = parseCarriers([{ id: "1234", name: "GLS" }, { id: 5, name: " SEUR " }, { id: "x" }]);
  it("carrier names by id", () => {
    expect([...carriers]).toEqual([["1234", "GLS"], ["5", "SEUR"]]);
  });
  it("parcels per order; only the documented word counts as delivered (AANNAME until measured)", () => {
    const answer = parseTracking(
      [
        { id: 123456, reference: "WZ-2026-00001", trackings: [{ trackingNumber: "ES123", statusDescription: "Delivered ", statusDate: "2016-05-13 11:35:40", carrier: { id: "1234" } }] },
        { id: "777", trackings: [{ trackingNumber: "1Z999AA10123456784", statusDescription: "in transit", carrier: { id: "9" } }, { statusDescription: "delivered" }] },
        { reference: "no id" },
      ],
      carriers,
    );
    expect(answer).toEqual({
      kind: "ok",
      orders: [
        { supplierOrderRef: "123456", parcels: [{ trackingNumber: "ES123", carrier: "GLS", statusText: "Delivered", statusAt: new Date("2016-05-13T11:35:40Z"), delivered: true }] },
        { supplierOrderRef: "777", parcels: [{ trackingNumber: "1Z999AA10123456784", carrier: null, statusText: "in transit", statusAt: null, delivered: false }] },
      ],
    });
    expect(parseTracking({ code: 500 }, carriers)).toEqual({ kind: "unknown" });
    expect(isDeliveredStatus("Entregado")).toBe(false);
    expect(parseSupplierTime("13-05-2016")).toBeNull();
  });
});

describe("the audit log in words", () => {
  it("field: before → after; amounts in cents shown as money", () => {
    expect(auditChange({ status: "PAID" }, { status: "CANCELLED", amountCents: 2445 })).toBe(`status: PAID → CANCELLED · amountCents: ${formatMoney(money(2445))}`);
    expect(auditChange(null, { fields: ["email", "phone"] })).toBe("fields: email, phone");
    expect(auditChange(null, null)).toBe("");
  });
});

describe("the mails after the sale", () => {
  const links = { statusUrl: "https://wonzo.nl/bestelling/abc", contactUrl: "https://wonzo.nl/contact", logoUrl: "https://wonzo.nl/x.png", email: "info@wonzo.nl", returnUrl: "https://wonzo.nl/retour", withdrawalFormUrl: "https://wonzo.nl/herroepingsformulier" };
  it("on its way: the tracking number and the invoice number, a name with markup as text", () => {
    const mail = orderShipped(
      { locale: "nl", reference: "WZ-2026-00001", lines: [{ name: "<b>Stoel</b>", quantity: 2 }], parcels: [{ carrier: "GLS", trackingNumber: "ES123" }], delivery: { minWorkingDays: 3, maxWorkingDays: 6 }, invoiceNumber: "2026-00007" },
      links,
      getMessages("nl"),
    );
    expect(mail.subject).toBe("Bestelling WZ-2026-00001 is onderweg");
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain("GLS: ES123");
      expect(part).toContain("2026-00007");
      expect(part).toContain("https://wonzo.nl/retour");
    }
    expect(mail.html).not.toContain("<b>Stoel</b>");
    expect(mail.html).toContain("&lt;b&gt;Stoel&lt;/b&gt;");
  });
  it("refunded with a deduction: the amount, the maximum and the reason", () => {
    const mail = returnRefunded(
      { locale: "en", reference: "WZ-2026-00001", number: "R2026-00001", lines: [{ name: "Stoel", sku: "S1", quantity: 1, reason: "none" }], max: money(1850), refund: money(1350), deductionReason: "used", rejectReason: null },
      links,
      getMessages("en"),
    );
    expect(mail.subject).toBe("Return R2026-00001 refunded");
    expect(mail.text).toContain(formatMoney(money(1350)));
    expect(mail.text).toContain(`That is less than the maximum of ${formatMoney(money(1850))}, because: used`);
  });
});

describe("who may act on a return (there is no database here)", () => {
  it("every return action and marking delivered refuse without an admin, before anything is read", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const form = new FormData();
    form.set("returnId", "1");
    form.set("orderId", "1");
    form.set("expectedStatus", "RECEIVED");
    form.set("amount", "18,50");
    form.set("expectedMaxCents", "1850");
    form.set("reason", "test");
    for (const act of [receiveReturnAction, rejectReturnAction, refundReturnAction]) expect(await act({ ok: null }, form)).toEqual({ ok: false, error: "access" });
    expect(await markDeliveredAction({ ok: null }, form)).toEqual({ ok: false, error: "access" });
    vi.unstubAllEnvs();
  });
  it("the customer's route answers nothing without a database", async () => {
    const res = await returnsRoute(new Request("http://localhost:3000/api/returns", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: "{}" }));
    expect(res.status).toBe(404);
  });
});
