// Making invoices and credit notes (D-21, docs/FACTUUR.md). An invoice is
// made when the cancel window has closed and the order goes to purchasing
// (D-21: never at payment, so a cancel inside the window never needs a credit
// note) — the "invoice" effect in the outbox. Its number comes from the
// counter in the same transaction as the document, so a failure gives the
// number back: no gaps. The PDF is made and stored in that transaction too
// (owner, D-21: always stored); it is CPU work only, no outside call. An
// order cancelled after it was invoiced gets a credit note with its own
// number, pointing to the invoice; so does a return once its refund went
// through (D-09) — for the pieces that came back, with a value deduction as a
// line of its own. An issued document is never changed. Server-side only.

import { createHash } from "node:crypto";
import { appendAudit } from "@/lib/admin/audit";
import { company } from "@/lib/company";
import { fromDbTime, getPool, selectRows, toDbTime, withTransaction, type Connection, type Queryable } from "@/lib/db";
import { amsterdamMonthRange } from "@/lib/dates";
import { amsterdamYear, nextNumber } from "@/lib/db/counters";
import { money, type Money } from "@/lib/money";
import { lockOrder } from "@/lib/orders/store";
import { MixedVatShipping, vatBreakdown } from "@/lib/pricing/vat";
import { fromSnapshot, invoiceNumber, negate, toSnapshot, type InvoiceDocument, type InvoiceKind } from "./document";
import { renderInvoicePdf } from "./pdf";

/** Order statuses after the window: paid, released for purchasing, or further (D-21). */
const INVOICEABLE = ["FULFILLMENT_PENDING", "PURCHASED", "PARTIALLY_FULFILLED", "SHIPPED", "DELIVERED", "COMPLETED", "CANCELLED"];

type Raw = Record<string, string | number | null>;

/** The invoice of an order, from its frozen lines (docs/DATAMODEL.md: frozen is frozen). */
async function invoiceDocument(conn: Queryable, orderId: number, number: string, issuedAt: Date): Promise<InvoiceDocument> {
  const [o] = await selectRows<Raw>(
    conn,
    `SELECT reference, created_at, paid_at, email, phone, first_name, last_name, street, house_number, postcode, city, country,
            subtotal_cents, shipping_standard_cents, shipping_large_cents, total_cents, currency FROM orders WHERE id = ?`,
    [orderId],
  );
  if (!o || o.currency !== "EUR") throw new Error(`order ${orderId}: not found or not in EUR`);
  const lines = await selectRows<Raw>(conn, "SELECT name, brand, sku, quantity, unit_price_cents, line_total_cents, vat_rate_bp, min_days, max_days FROM order_lines WHERE order_id = ? ORDER BY line_no", [orderId]);
  const [payment] = await selectRows<{ method: string | null }>(conn, "SELECT method FROM payments WHERE order_id = ? AND status = 'PAID' ORDER BY created_at, id LIMIT 1", [orderId]);
  const n = (r: Raw, k: string) => Number(r[k]);
  const vat = vatBreakdown(
    lines.map((l) => ({ quantity: n(l, "quantity"), unitPrice: money(n(l, "unit_price_cents")), lineTotal: money(n(l, "line_total_cents")), vatRateBp: n(l, "vat_rate_bp") })),
    money(n(o, "shipping_standard_cents") + n(o, "shipping_large_cents")),
  );
  // The invoice says exactly what was paid: one cent off is a question nobody wants (docs/FACTUUR.md § Rekenen).
  if (vat.totalIncl.amount !== n(o, "total_cents")) throw new Error(`order ${orderId}: invoice total ${vat.totalIncl.amount} ≠ order total ${n(o, "total_cents")}`);
  return {
    kind: "invoice",
    number,
    issuedAt,
    creditsNumber: null,
    orderReference: String(o.reference),
    orderedAt: fromDbTime(String(o.created_at)),
    paidAt: o.paid_at === null ? null : fromDbTime(String(o.paid_at)),
    paymentMethod: payment?.method ?? null,
    delivery: { minWorkingDays: Math.max(0, ...lines.map((l) => n(l, "min_days"))), maxWorkingDays: Math.max(0, ...lines.map((l) => n(l, "max_days"))) },
    seller: { tradeName: company.tradeName, legalName: company.legalName, address: company.address ?? "", email: company.email, kvk: company.kvk, vat: company.vat ?? "", iban: null },
    customer: {
      name: `${String(o.first_name)} ${String(o.last_name)}`,
      street: `${String(o.street)} ${String(o.house_number)}`,
      postcodeCity: `${String(o.postcode)} ${String(o.city)}`,
      country: String(o.country),
      email: String(o.email),
      phone: String(o.phone),
    },
    lines: lines.map((l, i) => ({ name: String(l.name), brand: l.brand === null ? null : String(l.brand), sku: String(l.sku), quantity: n(l, "quantity"), ...vat.lines[i]! })),
    shipping: vat.shipping,
    byRate: vat.byRate,
    totalExcl: vat.totalExcl,
    totalVat: vat.totalVat,
    totalIncl: vat.totalIncl,
  };
}

/** One document per (order, key): "invoice", "cancel" (a full credit note) or "return:<id>". */
type DocKey = "invoice" | "cancel" | `return:${number}`;

async function store(conn: Connection, doc: InvoiceDocument, orderId: number, creditsInvoiceId: number | null, actor: string, docKey: DocKey, returnId: number | null = null): Promise<number> {
  if (!company.vat) throw new Error("No VAT number in src/lib/company.ts: an invoice without one is not an invoice (art. 35a Wet OB)");
  const pdf = await renderInvoicePdf(doc);
  const [r] = await conn.query(
    `INSERT INTO invoices (number, kind, doc_key, order_id, return_id, credits_invoice_id, issued_at, currency, total_excl_cents, total_vat_cents, total_incl_cents, snapshot, pdf, pdf_sha256)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?)`,
    [doc.number, doc.kind, docKey, orderId, returnId, creditsInvoiceId, toDbTime(doc.issuedAt), doc.totalExcl.amount, doc.totalVat.amount, doc.totalIncl.amount, JSON.stringify(toSnapshot(doc)), pdf, createHash("sha256").update(pdf).digest("hex")],
  );
  const id = (r as { insertId: number }).insertId;
  for (const v of doc.byRate) await conn.query("INSERT INTO invoice_vat (invoice_id, vat_rate_bp, base_cents, vat_cents) VALUES (?, ?, ?, ?)", [id, v.vatRateBp, v.base.amount, v.vat.amount]);
  await appendAudit(conn, { actor, action: doc.kind === "credit" ? "invoice.credit-issued" : "invoice.issued", objectType: "order", objectId: orderId, after: { number: doc.number, totalCents: doc.totalIncl.amount } }, doc.issuedAt);
  return id;
}

const existing = async (db: Queryable, orderId: number, docKey: DocKey) =>
  (await selectRows<{ id: number | string; number: string; snapshot: unknown }>(db, "SELECT id, number, snapshot FROM invoices WHERE order_id = ? AND doc_key = ?", [orderId, docKey]))[0] ?? null;
const snapshotOf = (x: unknown) => fromSnapshot(typeof x === "string" ? JSON.parse(x) : x);

export type IssueOutcome = "created" | "exists" | "not-ready";

/** The invoice of an order, once. Safe to run twice (unique per order and kind). */
export async function issueInvoice(orderId: number, now: Date = new Date()): Promise<IssueOutcome> {
  return withTransaction(async (conn) => {
    const order = await lockOrder(conn, orderId);
    if (!order || !INVOICEABLE.includes(order.status)) return "not-ready";
    if (await existing(conn, orderId, "invoice")) return "exists";
    const year = amsterdamYear(now);
    const number = invoiceNumber("invoice", year, await nextNumber(conn, "invoice", year));
    await store(conn, await invoiceDocument(conn, orderId, number, now), orderId, null, "system", "invoice");
    return "created";
  });
}

/** A full credit note for an invoiced order that was cancelled: every amount turned around, its own number. */
export async function issueCreditNote(orderId: number, now: Date = new Date()): Promise<IssueOutcome> {
  return withTransaction(async (conn) => {
    const order = await lockOrder(conn, orderId);
    if (order?.status !== "CANCELLED") return "not-ready";
    const invoice = await existing(conn, orderId, "invoice");
    if (!invoice) return "not-ready";
    if (await existing(conn, orderId, "cancel")) return "exists";
    const original = snapshotOf(invoice.snapshot);
    const year = amsterdamYear(now);
    const number = invoiceNumber("credit", year, await nextNumber(conn, "credit", year));
    const doc: InvoiceDocument = { ...original, ...negate(original), kind: "credit", number, issuedAt: now, creditsNumber: original.number };
    await store(conn, doc, orderId, Number(invoice.id), "system", "cancel");
    return "created";
  });
}

/** Two VAT rates among the returned pieces with a value deduction: which rate the deduction carries is not decided (D-15). */
export class MixedVatDeduction extends Error {
  constructor() {
    super("D-15: a value deduction on a return with more than one VAT rate is not decided yet");
  }
}

/**
 * The credit note of a refunded return (D-09, docs/RETOUREN.md: made when
 * the refund succeeded). Lines: the returned pieces at their frozen price,
 * turned around; the shipping that went back; and, when the admin paid back
 * less, the difference as a positive line "Waardevermindering" at the rate of
 * the pieces. Its total is exactly minus what was paid back.
 */
export async function issueReturnCreditNote(returnId: number, now: Date = new Date()): Promise<IssueOutcome> {
  return withTransaction(async (conn) => {
    const [head] = await selectRows<{ order_id: number | string }>(conn, "SELECT order_id FROM returns WHERE id = ?", [returnId]);
    if (!head) return "not-ready";
    const orderId = Number(head.order_id);
    await lockOrder(conn, orderId);
    const [ret] = await selectRows<Raw>(conn, "SELECT number, status, lines_cents, shipping_cents, refund_cents FROM returns WHERE id = ?", [returnId]);
    if (ret?.status !== "REFUNDED" || ret.refund_cents === null) return "not-ready";
    const invoice = await existing(conn, orderId, "invoice");
    if (!invoice) return "not-ready";
    const key: DocKey = `return:${returnId}`;
    if (await existing(conn, orderId, key)) return "exists";
    const original = snapshotOf(invoice.snapshot);
    const pieces = await selectRows<Raw>(
      conn,
      `SELECT l.name, l.brand, l.sku, rl.quantity, l.unit_price_cents, l.vat_rate_bp
         FROM return_lines rl JOIN order_lines l ON l.order_id = ? AND l.line_no = rl.line_no WHERE rl.return_id = ? ORDER BY rl.line_no`,
      [orderId, returnId],
    );
    const n = (r: Raw, k: string) => Number(r[k]);
    const back = pieces.map((p) => ({ quantity: -n(p, "quantity"), unitPrice: money(n(p, "unit_price_cents")), lineTotal: money(-n(p, "unit_price_cents") * n(p, "quantity")), vatRateBp: n(p, "vat_rate_bp") }));
    const max = n(ret, "lines_cents") + n(ret, "shipping_cents");
    const deduction = max - n(ret, "refund_cents");
    if (deduction < 0) throw new Error(`return ${returnId}: refunded more than its maximum`);
    const rates = [...new Set(back.map((b) => b.vatRateBp))];
    if (deduction > 0 && rates.length !== 1) throw new MixedVatDeduction();
    const lines = deduction > 0 ? [...back, { quantity: 1, unitPrice: money(deduction), lineTotal: money(deduction), vatRateBp: rates[0]! }] : back;
    const vat = vatBreakdown(lines, money(-n(ret, "shipping_cents")));
    if (vat.totalIncl.amount !== -n(ret, "refund_cents")) throw new Error(`return ${returnId}: credit note total ${vat.totalIncl.amount} ≠ −${n(ret, "refund_cents")}`);
    const year = amsterdamYear(now);
    const number = invoiceNumber("credit", year, await nextNumber(conn, "credit", year));
    const doc: InvoiceDocument = {
      ...original,
      kind: "credit",
      number,
      issuedAt: now,
      creditsNumber: original.number,
      returnNumber: String(ret.number),
      lines: [
        ...pieces.map((p, i) => ({ name: String(p.name), brand: p.brand === null ? null : String(p.brand), sku: String(p.sku), quantity: back[i]!.quantity, ...vat.lines[i]! })),
        ...(deduction > 0 ? [{ name: "Waardevermindering", brand: null, sku: "", quantity: 1, ...vat.lines[back.length]! }] : []),
      ],
      shipping: vat.shipping,
      byRate: vat.byRate,
      totalExcl: vat.totalExcl,
      totalVat: vat.totalVat,
      totalIncl: vat.totalIncl,
    };
    await store(conn, doc, orderId, Number(invoice.id), "system", key, returnId);
    return "created";
  });
}

/**
 * The invoicing round of the orders job: every "invoice" effect that is due,
 * then a credit note for every invoiced order that was cancelled since. A
 * document that cannot be made (e.g. shipping with two VAT rates, still open
 * in D-15) is FAILED in the outbox and on the dashboard — never a guess.
 */
export async function runInvoicing(now: Date = new Date(), limit = 50): Promise<{ invoices: number; credits: number; failed: number }> {
  const run = { invoices: 0, credits: 0, failed: 0 };
  const due = await selectRows<{ id: number | string; payload: unknown }>(
    getPool(),
    "SELECT id, payload FROM outbox WHERE kind = 'invoice' AND status = 'PENDING' AND next_attempt_at <= ? ORDER BY id LIMIT ?",
    [toDbTime(now), limit],
  );
  for (const item of due) {
    const payload = (typeof item.payload === "string" ? JSON.parse(item.payload) : item.payload) as { orderId?: unknown } | null;
    const orderId = Number(payload?.orderId);
    try {
      const outcome = Number.isSafeInteger(orderId) ? await issueInvoice(orderId, now) : "not-ready";
      if (outcome === "created") run.invoices++;
      await getPool().query("UPDATE outbox SET status = 'DONE', sent_at = ?, last_error = ? WHERE id = ?", [toDbTime(now), outcome === "not-ready" ? "bestelling niet te factureren" : null, item.id]);
    } catch (err) {
      run.failed++;
      const reason = err instanceof MixedVatShipping ? "btw op verzendkosten bij twee tarieven: nog niet beslist (D-15)" : err instanceof Error ? err.message : "onbekende fout";
      await getPool().query("UPDATE outbox SET status = 'FAILED', attempts = attempts + 1, last_error = ? WHERE id = ?", [reason.slice(0, 500), item.id]);
    }
  }
  const cancelled = await selectRows<{ order_id: number | string }>(
    getPool(),
    `SELECT i.order_id FROM invoices i JOIN orders o ON o.id = i.order_id
      WHERE i.doc_key = 'invoice' AND o.status = 'CANCELLED'
        AND NOT EXISTS (SELECT 1 FROM invoices c WHERE c.order_id = i.order_id AND c.doc_key = 'cancel')
      ORDER BY i.id LIMIT ?`,
    [limit],
  );
  for (const c of cancelled) if ((await issueCreditNote(Number(c.order_id), now)) === "created") run.credits++;
  // Refunded returns without their credit note. One that cannot be made stays on the dashboard
  // (the query in src/lib/admin/orders.ts) and is tried again next round — never guessed.
  const refunded = await selectRows<{ id: number | string }>(
    getPool(),
    `SELECT r.id FROM returns r WHERE r.status = 'REFUNDED' AND NOT EXISTS (SELECT 1 FROM invoices c WHERE c.return_id = r.id) ORDER BY r.id LIMIT ?`,
    [limit],
  );
  for (const r of refunded) {
    try {
      if ((await issueReturnCreditNote(Number(r.id), now)) === "created") run.credits++;
    } catch (err) {
      run.failed++;
      console.error("[invoices] return credit note", Number(r.id), err instanceof Error ? err.message.slice(0, 200) : "unknown");
    }
  }
  return run;
}

/** The stored PDF of a document, as it was issued. */
export async function invoicePdf(db: Queryable, invoiceId: number): Promise<{ number: string; kind: InvoiceKind; orderId: number; pdf: Buffer } | null> {
  const [r] = await selectRows<{ number: string; kind: string; order_id: number | string; pdf: Buffer }>(db, "SELECT number, kind, order_id, pdf FROM invoices WHERE id = ?", [invoiceId]);
  return r ? { number: r.number, kind: r.kind === "credit" ? "credit" : "invoice", orderId: Number(r.order_id), pdf: r.pdf } : null;
}

export type InvoiceListRow = { id: number; number: string; kind: InvoiceKind; orderId: number; reference: string; customer: string; issuedAt: Date; totalIncl: Money };

/**
 * The documents of one month (Dutch calendar), newest first, for the panel.
 * Searching is on the order (number, name): the frozen snapshot has no index.
 */
export async function listInvoices(db: Queryable, year: number, month: number): Promise<InvoiceListRow[]> {
  const { from, to } = amsterdamMonthRange(year, month);
  const rows = await selectRows<Raw>(
    db,
    `SELECT i.id, i.number, i.kind, i.order_id, o.reference, o.first_name, o.last_name, i.issued_at, i.total_incl_cents
       FROM invoices i JOIN orders o ON o.id = i.order_id
      WHERE i.issued_at >= ? AND i.issued_at < ? ORDER BY i.id DESC LIMIT 500`,
    [toDbTime(from), toDbTime(to)],
  );
  return rows.map((r) => ({
    id: Number(r.id), number: String(r.number), kind: r.kind === "credit" ? "credit" : "invoice", orderId: Number(r.order_id), reference: String(r.reference),
    customer: `${String(r.first_name)} ${String(r.last_name)}`, issuedAt: fromDbTime(String(r.issued_at)), totalIncl: money(Number(r.total_incl_cents)),
  }));
}

export type VatMonth = { month: number; documents: number; byRate: { vatRateBp: number; base: Money; vat: Money }[] };

/**
 * What the VAT return asks, per month of a year: turnover per rate excluding
 * VAT, the VAT, and the number of documents — credit notes count as negative
 * (docs/FACTUUR.md § Het btw-overzicht). One GROUP BY, in Dutch time.
 */
export async function vatOverview(db: Queryable, year: number): Promise<VatMonth[]> {
  const months: VatMonth[] = [];
  for (let m = 1; m <= 12; m++) {
    const { from, to } = amsterdamMonthRange(year, m);
    const rows = await selectRows<{ rate: number | string; base: number | string; vat: number | string; docs: number | string }>(
      db,
      `SELECT v.vat_rate_bp AS rate, SUM(v.base_cents) AS base, SUM(v.vat_cents) AS vat, COUNT(DISTINCT i.id) AS docs
         FROM invoices i JOIN invoice_vat v ON v.invoice_id = i.id
        WHERE i.issued_at >= ? AND i.issued_at < ? GROUP BY v.vat_rate_bp ORDER BY v.vat_rate_bp DESC`,
      [toDbTime(from), toDbTime(to)],
    );
    const [count] = await selectRows<{ n: number | string }>(db, "SELECT COUNT(*) AS n FROM invoices WHERE issued_at >= ? AND issued_at < ?", [toDbTime(from), toDbTime(to)]);
    months.push({ month: m, documents: Number(count?.n ?? 0), byRate: rows.map((r) => ({ vatRateBp: Number(r.rate), base: money(Number(r.base)), vat: money(Number(r.vat)) })) });
  }
  return months;
}

/** The documents of one order: the status page and the order page link to them. */
export async function invoicesOfOrder(db: Queryable, orderId: number): Promise<{ id: number; number: string; kind: InvoiceKind }[]> {
  const rows = await selectRows<{ id: number | string; number: string; kind: string }>(db, "SELECT id, number, kind FROM invoices WHERE order_id = ? ORDER BY id", [orderId]);
  return rows.map((r) => ({ id: Number(r.id), number: r.number, kind: r.kind === "credit" ? "credit" : "invoice" }));
}
