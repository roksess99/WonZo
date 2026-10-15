// An example invoice for the panel's preview and the tests: the amounts of
// the owner's example (2026-10-12) — € 4,59, 4 × € 2,97 and € 60,92 with
// € 7,45 shipping, all 21 % — so the totals can be checked by hand:
// excl. € 70,12, VAT € 14,72, incl. € 84,84. Names with characters outside
// WinAnsi (docs/FACTUUR.md § Lettertypen). Fixed values: the same bytes each time.

import { company } from "@/lib/company";
import { money } from "@/lib/money";
import { vatBreakdown } from "@/lib/pricing/vat";
import type { InvoiceDocument } from "./document";

const input = [
  { name: "Bewaardoos bamboe, set van 3", brand: "Kinvara", sku: "S3601234", quantity: 1, unitPrice: money(459), lineTotal: money(459), vatRateBp: 2100 },
  { name: "Theelichthouder glas — Łódź-serie", brand: "Ærø Home", sku: "S7715432", quantity: 4, unitPrice: money(297), lineTotal: money(1188), vatRateBp: 2100 },
  { name: "Robotstofzuiger met dweilfunctie, extra lange naam zoals groothandels die graag gebruiken", brand: "Öztürk Elektro", sku: "S5550001", quantity: 1, unitPrice: money(6092), lineTotal: money(6092), vatRateBp: 2100 },
];

export function exampleInvoice(kind: "invoice" | "credit" = "invoice"): InvoiceDocument {
  const vat = vatBreakdown(input, money(745));
  const at = new Date("2026-10-12T14:05:00Z");
  return {
    kind,
    number: kind === "credit" ? "C2026-00001" : "2026-00001",
    issuedAt: at,
    creditsNumber: kind === "credit" ? "2026-00001" : null,
    orderReference: "WZ-2026-00012",
    orderedAt: new Date("2026-10-12T13:30:00Z"),
    paidAt: new Date("2026-10-12T13:32:00Z"),
    paymentMethod: "ideal",
    delivery: { minWorkingDays: 3, maxWorkingDays: 6 },
    seller: { tradeName: company.tradeName, legalName: company.legalName, address: company.address ?? "", email: company.email, kvk: company.kvk, vat: company.vat ?? "", iban: null },
    customer: { name: "Łukasz Öztürk-ß", street: "Ëerste Ölstraat 1-a", postcodeCity: "1234 AB 's-Hertogenbosch", country: "NL", email: "klant@example.nl", phone: "0612345678" },
    lines: input.map((l, i) => ({ name: l.name, brand: l.brand, sku: l.sku, quantity: l.quantity, ...vat.lines[i]! })),
    shipping: vat.shipping,
    byRate: vat.byRate,
    totalExcl: vat.totalExcl,
    totalVat: vat.totalVat,
    totalIncl: vat.totalIncl,
  };
}
