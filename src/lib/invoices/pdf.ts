// The invoice as PDF (docs/FACTUUR.md), laid out like the example the owner
// gave (2026-10-12): the shop's name with an accent bar, "FACTUUR" with number
// and date on the right; seller and delivery address side by side; a table
// with excl. and incl. per piece and per line; subtotal, shipping, VAT per
// rate and the total excl. and incl.; "paid" and the cooling-off period below.
//
// GEMETEN 2026-10-12 (pdfkit 0.20.2, DM Sans 1.200): every character of the
// test line in docs/FACTUUR.md is in the font; the PDF is tagged (structure
// tree, language, title); the same input gives the same bytes, also in two
// processes, once the dates in the metadata are fixed — which is why the
// issue date is the only date in it. Server-side only.

import path from "node:path";
import PDFDocument from "pdfkit";
import { formatMoney, type Money } from "@/lib/money";
import type { InvoiceDocument } from "./document";

if (typeof window !== "undefined") throw new Error("Invoices are made on the server");

const FONTS = path.join(process.cwd(), "assets", "fonts");
const C = { text: "#1d1a17", muted: "#6b635a", line: "#e6ded3", accent: "#c8440c", petrol: "#0e4d4a" } as const;
const PAGE = { width: 595.28, height: 841.89, margin: 48 } as const;
const RIGHT = PAGE.width - PAGE.margin;
const BOTTOM = PAGE.height - 96;

/** Columns of the table: x and width; amounts right-aligned. */
const COLS = [
  { key: "desc", x: 48, w: 196, label: "OMSCHRIJVING", align: "left" },
  { key: "qty", x: 246, w: 40, label: "AANTAL", align: "right" },
  { key: "unitExcl", x: 290, w: 62, label: "STUK EXCL.", align: "right" },
  { key: "unitIncl", x: 354, w: 62, label: "STUK INCL.", align: "right" },
  { key: "totalExcl", x: 418, w: 62, label: "TOTAAL EXCL.", align: "right" },
  { key: "totalIncl", x: 482, w: RIGHT - 482, label: "TOTAAL INCL.", align: "right" },
] as const;

const date = (d: Date) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(d);
const pct = (bp: number) => `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(bp / 100)}%`;
const eur = (m: Money) => formatMoney(m);
/** Mollie's method id as people know it (D-05: iDEAL, Apple Pay, Google Pay under cards, credit card). */
const METHOD_NAMES: Record<string, string> = { ideal: "iDEAL", applepay: "Apple Pay", googlepay: "Google Pay", creditcard: "creditcard" };
const methodName = (id: string) => METHOD_NAMES[id] ?? id;

export function renderInvoicePdf(doc: InvoiceDocument): Promise<Buffer> {
  const credit = doc.kind === "credit";
  const title = `${credit ? "Creditnota" : "Factuur"} ${doc.number}`;
  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: PAGE.margin, bottom: 24, left: PAGE.margin, right: PAGE.margin },
    pdfVersion: "1.7",
    lang: "nl-NL",
    tagged: true,
    displayTitle: true,
    bufferPages: true,
    autoFirstPage: true,
    // Fixed: the same invoice gives the same bytes (docs/FACTUUR.md § Determinisme).
    info: { Title: title, Author: doc.seller.tradeName, Subject: `Bestelling ${doc.orderReference}`, CreationDate: doc.issuedAt, ModDate: doc.issuedAt },
  });
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });
  pdf.registerFont("r", path.join(FONTS, "DMSans-Regular.ttf"));
  pdf.registerFont("b", path.join(FONTS, "DMSans-Bold.ttf"));

  const root = pdf.struct("Document");
  pdf.addStructure(root);
  const artifact = (draw: () => void) => {
    pdf.markContent("Artifact", { type: "Layout" });
    draw();
    pdf.endMarkedContent();
  };
  const text = (s: string, x: number, y: number, o: { font?: "r" | "b"; size?: number; color?: string; width?: number; align?: "left" | "right" } = {}) => {
    pdf.font(o.font ?? "r").fontSize(o.size ?? 9).fillColor(o.color ?? C.text).text(s, x, y, { width: o.width, align: o.align ?? "left", lineBreak: o.width !== undefined });
  };
  const para = (s: string, x: number, y: number, o: Parameters<typeof text>[3] = {}) => root.add(pdf.struct("P", {}, () => text(s, x, y, o)));

  // --- head
  const head = () => {
    root.add(pdf.struct("H1", {}, () => text(doc.seller.tradeName, 48, 48, { font: "b", size: 26, color: C.petrol })));
    artifact(() => pdf.rect(48, 84, 62, 4).fill(C.accent));
    para(credit ? "CREDITNOTA" : "FACTUUR", 300, 44, { font: "b", size: 9, color: C.muted, width: RIGHT - 300, align: "right" });
    para(doc.number, 300, 57, { font: "b", size: 12, width: RIGHT - 300, align: "right" });
    para(date(doc.issuedAt), 300, 73, { size: 9, color: C.muted, width: RIGHT - 300, align: "right" });
  };
  head();

  // --- seller and customer
  let y = 112;
  const block = (label: string, lines: string[], x: number) => {
    const s = pdf.struct("Sect");
    root.add(s);
    s.add(pdf.struct("H2", {}, () => text(label, x, y, { font: "b", size: 8, color: C.muted })));
    lines.forEach((l, i) => s.add(pdf.struct("P", {}, () => text(l, x, y + 14 + i * 12, { width: 240 }))));
    s.end();
  };
  const seller = doc.seller;
  block(
    "VERKOPER",
    [`${seller.tradeName} (${seller.legalName})`, ...seller.address.split(",").map((p) => p.trim()), "Nederland", seller.email, `KvK: ${seller.kvk}`, `Btw: ${seller.vat}`, ...(seller.iban ? [`IBAN: ${seller.iban}`] : [])],
    48,
  );
  const c = doc.customer;
  block(
    credit ? "KLANT" : "BEZORGADRES",
    [c.name, c.street, c.postcodeCity, c.country === "NL" ? "Nederland" : c.country, c.email, c.phone, `Verwachte levering: binnen ${doc.delivery.minWorkingDays}–${doc.delivery.maxWorkingDays} werkdagen na de bestelling`],
    297.6,
  );
  y += 14 + 9 * 12 + 6;
  para(
    `Bestelling ${doc.orderReference} van ${date(doc.orderedAt)}${doc.creditsNumber ? ` — correctie op factuur ${doc.creditsNumber}` : ""}${doc.returnNumber ? `, retour ${doc.returnNumber}` : ""}`,
    48,
    y,
    { size: 9, color: C.muted, width: RIGHT - 48 },
  );
  y += 26;

  // --- the table; its head again on every page
  const table = pdf.struct("Table");
  root.add(table);
  const tableHead = () => {
    const tr = pdf.struct("TR");
    table.add(tr);
    for (const col of COLS) tr.add(pdf.struct("TH", {}, () => text(col.label, col.x + (col.key === "desc" ? 6 : 0), y, { font: "b", size: 7.5, color: C.muted, width: col.w, align: col.align })));
    tr.end();
    artifact(() => pdf.moveTo(48, y + 13).lineTo(RIGHT, y + 13).lineWidth(0.5).strokeColor(C.line).stroke());
    y += 22;
  };
  const newPage = () => {
    pdf.addPage();
    y = PAGE.margin;
    root.add(pdf.struct("P", {}, () => text(`${credit ? "Creditnota" : "Factuur"} ${doc.number} (vervolg)`, 48, y, { font: "b", size: 10 })));
    y += 26;
    tableHead();
  };
  tableHead();
  for (const l of doc.lines) {
    pdf.font("b").fontSize(9);
    const nameHeight = pdf.heightOfString(l.name, { width: COLS[0].w - 6 });
    const rowHeight = nameHeight + 18;
    if (y + rowHeight > BOTTOM) newPage();
    const tr = pdf.struct("TR");
    table.add(tr);
    tr.add(
      pdf.struct("TD", {}, () => {
        text(l.name, 54, y, { font: "b", width: COLS[0].w - 6 });
        text([l.brand, l.sku].filter(Boolean).join("  ·  "), 54, y + nameHeight + 2, { size: 8, color: C.muted, width: COLS[0].w - 6 });
      }),
    );
    const cells = [String(l.quantity), eur(l.unitExcl), eur(l.unitIncl), eur(l.totalExcl), eur(l.totalIncl)];
    cells.forEach((v, i) => tr.add(pdf.struct("TD", {}, () => text(v, COLS[i + 1]!.x, y, { font: i === 4 ? "b" : "r", width: COLS[i + 1]!.w, align: "right" }))));
    tr.end();
    y += rowHeight + 6;
  }
  table.end();

  // --- totals, on the last page, kept together
  const totalsRows = 3 + doc.byRate.length;
  if (y + totalsRows * 14 + 40 > BOTTOM) newPage();
  artifact(() => pdf.moveTo(246, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor(C.line).stroke());
  y += 10;
  const totals = pdf.struct("Table");
  root.add(totals);
  const row = (label: string, excl: string, incl: string, bold = false, size = 9) => {
    const tr = pdf.struct("TR");
    totals.add(tr);
    tr.add(pdf.struct("TH", {}, () => text(label, 246, y, { font: bold ? "b" : "r", size, width: 170 })));
    tr.add(pdf.struct("TD", {}, () => text(excl, COLS[4].x, y, { font: bold ? "b" : "r", size, width: COLS[4].w, align: "right" })));
    tr.add(pdf.struct("TD", {}, () => text(incl, COLS[5].x, y, { font: bold ? "b" : "r", size, width: COLS[5].w, align: "right" })));
    tr.end();
    y += size + 6;
  };
  const productsExcl = doc.lines.reduce((s, l) => s + l.totalExcl.amount, 0);
  const productsIncl = doc.lines.reduce((s, l) => s + l.totalIncl.amount, 0);
  const cur = doc.totalIncl.currency;
  row("Subtotaal artikelen", eur({ amount: productsExcl, currency: cur }), eur({ amount: productsIncl, currency: cur }));
  if (doc.shipping) row("Verzendkosten", eur(doc.shipping.excl), eur(doc.shipping.incl));
  for (const r of doc.byRate) row(`Btw ${pct(r.vatRateBp)} over ${eur(r.base)}`, "", eur(r.vat));
  y += 8;
  row("Totaal", eur(doc.totalExcl), eur(doc.totalIncl), true, 11);
  totals.end();

  // --- what the customer needs to know, below
  y = Math.max(y + 24, BOTTOM - 30);
  const paid = doc.paidAt ? `Betaald${doc.paymentMethod ? ` via ${methodName(doc.paymentMethod)}` : ""} op ${date(doc.paidAt)}. Ordernummer ${doc.orderReference}.` : `Ordernummer ${doc.orderReference}.`;
  const notes = [
    "Alle bedragen in euro. De prijzen in de winkel zijn inclusief btw.",
    credit ? `Deze creditnota corrigeert factuur ${doc.creditsNumber}; het bedrag is of wordt terugbetaald via de oorspronkelijke betaling.` : "14 dagen bedenktijd vanaf ontvangst van het pakket (herroepingsrecht).",
    credit ? `Ordernummer ${doc.orderReference}.` : paid,
  ];
  notes.forEach((n, i) => para(n, 48, y + i * 12, { size: 8, color: C.muted, width: RIGHT - 48 }));
  root.end();

  // --- page numbers, once the number of pages is known
  const range = pdf.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    pdf.switchToPage(range.start + i);
    pdf.markContent("Artifact", { type: "Pagination" });
    text(`Pagina ${i + 1} van ${range.count}`, 48, PAGE.height - 40, { size: 8, color: C.muted, width: RIGHT - 48, align: "right" });
    pdf.endMarkedContent();
  }
  pdf.end();
  return done;
}
