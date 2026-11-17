// Invoices and credit notes against the test database (D-21, docs/FACTUUR.md):
// made once when the order goes to purchasing, numbered without gaps, the
// stored PDF opened only with the order's key, a credit note when an invoiced
// order is cancelled — and a document that cannot be made gives its number back.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as customerPdf } from "@/app/api/orders/invoice/route";
import { cancelAndRefund } from "@/lib/admin/order-actions";
import { attentionItems } from "@/lib/admin/orders";
import { getPool, selectRows } from "@/lib/db";
import { runInvoicing } from "@/lib/invoices";
import { placeOrder, releaseClosedWindows } from "@/lib/orders";
import { CANCEL_WINDOW_MS } from "@/lib/orders/states";
import { handleWebhook, startPayment } from "@/lib/payments";
import { exclusive } from "@/lib/pricing/vat";
import { FakeMollie } from "./fake-mollie";

afterAll(async () => {
  await getPool().end();
});

let mollie: FakeMollie;

// Other integration tests release orders to purchasing, each with an "invoice" effect nobody
// carries out. The worker takes the oldest first, so make those once here (as of a month
// ahead: some are due only in the future) — otherwise these tests wait behind them.
beforeAll(async () => {
  const later = new Date(Date.now() + 30 * 86_400_000);
  for (let round = 0; round < 50; round++) {
    await runInvoicing(later, 500);
    const [left] = await selectRows<{ n: number | string }>(getPool(), "SELECT COUNT(*) AS n FROM outbox WHERE kind = 'invoice' AND status = 'PENDING'");
    if (Number(left?.n ?? 0) === 0) break;
  }
}, 300_000);

beforeEach(() => {
  mollie = new FakeMollie();
});

const customer = { email: "factuur@example.nl", phone: "0612345678", firstName: "Łukasz", lastName: "Öztürk", street: "Teststraat", houseNumber: "1", postcode: "1234 AB", city: "Arnhem" };
const urls = { redirectUrl: "https://wonzo.nl/bestelling/x", webhookUrl: "https://wonzo.nl/api/payments/webhook" };
const twoLines = [
  { source: "bigbuy", productId: "1300118", quantity: 2 },
  { source: "bigbuy", productId: "1300104", quantity: 1 },
];

/** Paid and past the window: FULFILLMENT_PENDING, with "invoice" in the outbox. */
async function released(lines = twoLines, now = new Date()) {
  const r = await placeOrder({ checkoutAttemptId: randomUUID(), locale: "nl", lines, customer }, now);
  if (r.kind !== "placed") throw new Error(r.kind);
  await startPayment({ orderId: r.orderId, ...urls, now }, mollie);
  const tr = mollie.idOfOrder(r.orderId);
  mollie.setStatus(tr, "paid");
  await handleWebhook(tr, mollie, now);
  const at = new Date(now.getTime() + CANCEL_WINDOW_MS + 60_000);
  await releaseClosedWindows(at);
  return { orderId: r.orderId, reference: r.reference, token: r.accessToken, at };
}
type Doc = { id: number | string; number: string; kind: string; credits_invoice_id: number | string | null; total_excl_cents: number | string; total_vat_cents: number | string; total_incl_cents: number | string; pdf: Buffer };
const docsOf = async (orderId: number) =>
  selectRows<Doc>(getPool(), "SELECT id, number, kind, credits_invoice_id, total_excl_cents, total_vat_cents, total_incl_cents, pdf FROM invoices WHERE order_id = ? ORDER BY id", [orderId]);
const orderTotal = async (orderId: number) => Number((await selectRows<{ t: number | string }>(getPool(), "SELECT total_cents AS t FROM orders WHERE id = ?", [orderId]))[0]!.t);
const counter = async (series: string) =>
  Number((await selectRows<{ v: number | string }>(getPool(), "SELECT last_value AS v FROM counters WHERE series = ? AND period = ?", [series, new Date().getUTCFullYear()]))[0]?.v ?? 0);

describe("the invoice: once, when the order goes to purchasing (D-21)", () => {
  it("is made with the next number, the order's total, VAT per rate, and the stored PDF; a second run changes nothing", async () => {
    const o = await released();
    await runInvoicing(o.at);
    const [inv] = await docsOf(o.orderId);
    expect(inv).toMatchObject({ kind: "invoice", credits_invoice_id: null });
    expect(inv!.number).toMatch(/^\d{4}-\d{5}$/);
    // What was paid, exactly; VAT taken out per line (D-15).
    expect(Number(inv!.total_incl_cents)).toBe(await orderTotal(o.orderId));
    expect(Number(inv!.total_excl_cents) + Number(inv!.total_vat_cents)).toBe(Number(inv!.total_incl_cents));
    const lines = await selectRows<{ line_total_cents: number | string }>(getPool(), "SELECT line_total_cents FROM order_lines WHERE order_id = ?", [o.orderId]);
    const shipping = (await selectRows<{ s: number | string }>(getPool(), "SELECT shipping_standard_cents + shipping_large_cents AS s FROM orders WHERE id = ?", [o.orderId]))[0]!;
    expect(Number(inv!.total_excl_cents)).toBe(lines.reduce((s, l) => s + exclusive(Number(l.line_total_cents), 2100), 0) + exclusive(Number(shipping.s), 2100));
    expect(inv!.pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.7");
    const vat = await selectRows<{ vat_rate_bp: number; base_cents: number | string; vat_cents: number | string }>(getPool(), "SELECT vat_rate_bp, base_cents, vat_cents FROM invoice_vat WHERE invoice_id = ?", [inv!.id]);
    expect(vat).toEqual([{ vat_rate_bp: 2100, base_cents: Number(inv!.total_excl_cents), vat_cents: Number(inv!.total_vat_cents) }]);
    await runInvoicing(new Date(o.at.getTime() + 60_000));
    expect(await docsOf(o.orderId)).toHaveLength(1);
  });

  it("the numbers of the year run without a gap", async () => {
    await released().then((o) => runInvoicing(o.at));
    await released().then((o) => runInvoicing(o.at));
    const year = new Date().getUTCFullYear();
    const numbers = (await selectRows<{ number: string }>(getPool(), "SELECT number FROM invoices WHERE kind = 'invoice' AND number LIKE ? ORDER BY number", [`${year}-%`])).map((r) => Number(r.number.slice(5)));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });

  it("the customer opens it with the key from the link — and not another order's invoice with that key", async () => {
    const a = await released();
    const b = await released();
    await runInvoicing(b.at);
    const [invA] = await docsOf(a.orderId);
    const [invB] = await docsOf(b.orderId);
    const ok = await customerPdf(new Request(`http://localhost:3000/api/orders/invoice?token=${a.token}&id=${invA!.id}`));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toBe(`attachment; filename="factuur-${invA!.number}.pdf"`);
    expect(ok.headers.get("referrer-policy")).toBe("no-referrer");
    expect((await customerPdf(new Request(`http://localhost:3000/api/orders/invoice?token=${a.token}&id=${invB!.id}`))).status).toBe(404);
  });
});

describe("a credit note when an invoiced order is cancelled", () => {
  it("has its own number, points to the invoice, and every amount turned around — once", async () => {
    const o = await released();
    await runInvoicing(o.at);
    const [inv] = await docsOf(o.orderId);
    expect(await cancelAndRefund({ orderId: o.orderId, expectedRefundCents: await orderTotal(o.orderId), reason: "geannuleerd na het venster", actor: "admin:test", now: o.at }, mollie)).toEqual({ ok: true, refund: "sent" });
    await runInvoicing(new Date(o.at.getTime() + 60_000));
    const docs = await docsOf(o.orderId);
    expect(docs.map((d) => d.kind)).toEqual(["invoice", "credit"]);
    const credit = docs[1]!;
    expect(credit.number).toMatch(/^C\d{4}-\d{5}$/);
    expect(Number(credit.credits_invoice_id)).toBe(Number(inv!.id));
    expect(Number(credit.total_incl_cents)).toBe(-Number(inv!.total_incl_cents));
    await runInvoicing(new Date(o.at.getTime() + 120_000));
    expect(await docsOf(o.orderId)).toHaveLength(2);
  });
});

describe("what cannot be made is not guessed", () => {
  it("shipping with two VAT rates (still open in D-15): FAILED, on the dashboard, and the number given back", async () => {
    const o = await released();
    // One line at 9 %: the rate for the shipping is not decided.
    await getPool().query("UPDATE order_lines SET vat_rate_bp = 900 WHERE order_id = ? AND line_no = 1", [o.orderId]);
    const before = await counter("invoice");
    await runInvoicing(o.at);
    expect(await docsOf(o.orderId)).toEqual([]);
    const [row] = await selectRows<{ status: string; last_error: string }>(getPool(), "SELECT status, last_error FROM outbox WHERE kind = 'invoice' AND JSON_VALUE(payload, '$.orderId') = ?", [o.orderId]);
    expect(row).toMatchObject({ status: "FAILED", last_error: expect.stringContaining("D-15") });
    expect((await attentionItems(getPool(), o.at)).filter((i) => i.orderId === o.orderId).map((i) => i.kind)).toContain("invoice-failed");
    // Other orders in this run may have taken numbers; this one took none and left no gap.
    const year = new Date().getUTCFullYear();
    const numbers = (await selectRows<{ number: string }>(getPool(), "SELECT number FROM invoices WHERE kind = 'invoice' AND number LIKE ? ORDER BY number", [`${year}-%`])).map((r) => Number(r.number.slice(5)));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    expect(await counter("invoice")).toBe(numbers.length);
    expect(before).toBeLessThanOrEqual(numbers.length);
  });
});
