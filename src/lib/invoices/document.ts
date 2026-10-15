// What is on an invoice or credit note (docs/FACTUUR.md § Wat er op moet,
// `WETTELIJK` art. 35a Wet OB — to be confirmed). Frozen when the document is
// made and stored with it (invoices.snapshot): a later change to the shop's
// name, address or a product never reaches an issued invoice. Pure.

import type { Money } from "@/lib/money";
import type { VatBreakdown } from "@/lib/pricing/vat";

export type InvoiceKind = "invoice" | "credit";

export type InvoiceDocument = {
  kind: InvoiceKind;
  number: string;
  issuedAt: Date;
  /** A credit note: the invoice it corrects. */
  creditsNumber: string | null;
  /** A credit note for a return (D-09): its number, "R2026-00001". Absent on documents made before returns existed. */
  returnNumber?: string | null;
  orderReference: string;
  orderedAt: Date;
  paidAt: Date | null;
  paymentMethod: string | null;
  delivery: { minWorkingDays: number; maxWorkingDays: number };
  seller: { tradeName: string; legalName: string; address: string; email: string; kvk: string; vat: string; iban: string | null };
  customer: { name: string; street: string; postcodeCity: string; country: string; email: string; phone: string };
  lines: { name: string; brand: string | null; sku: string; quantity: number; unitExcl: Money; unitIncl: Money; totalExcl: Money; totalIncl: Money; vatRateBp: number }[];
  shipping: VatBreakdown["shipping"];
  byRate: VatBreakdown["byRate"];
  totalExcl: Money;
  totalVat: Money;
  totalIncl: Money;
};

/** "2026-00001" (D-21: per year, five digits); a credit note "C2026-00001". */
export function invoiceNumber(kind: InvoiceKind, year: number, n: number): string {
  return `${kind === "credit" ? "C" : ""}${year}-${String(n).padStart(5, "0")}`;
}

/** The same document with every amount turned around: what a full credit note says. */
export function negate(doc: InvoiceDocument): Pick<InvoiceDocument, "lines" | "shipping" | "byRate" | "totalExcl" | "totalVat" | "totalIncl"> {
  const neg = (m: Money): Money => ({ amount: -m.amount, currency: m.currency });
  return {
    lines: doc.lines.map((l) => ({ ...l, quantity: -l.quantity, totalExcl: neg(l.totalExcl), totalIncl: neg(l.totalIncl) })),
    shipping: doc.shipping ? { ...doc.shipping, excl: neg(doc.shipping.excl), incl: neg(doc.shipping.incl), vat: neg(doc.shipping.vat) } : null,
    byRate: doc.byRate.map((r) => ({ ...r, base: neg(r.base), vat: neg(r.vat) })),
    totalExcl: neg(doc.totalExcl),
    totalVat: neg(doc.totalVat),
    totalIncl: neg(doc.totalIncl),
  };
}

/** The document as stored JSON (dates as ISO strings), and back. */
export function toSnapshot(doc: InvoiceDocument): Record<string, unknown> {
  return JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
}

export function fromSnapshot(x: unknown): InvoiceDocument {
  const d = x as Record<string, unknown>;
  const date = (v: unknown) => (typeof v === "string" ? new Date(v) : null);
  return { ...(d as unknown as InvoiceDocument), issuedAt: date(d.issuedAt)!, orderedAt: date(d.orderedAt)!, paidAt: date(d.paidAt) };
}
