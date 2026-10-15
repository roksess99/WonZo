// VAT and the invoice PDF without a database (D-15, D-21, docs/FACTUUR.md).
// The amounts are the owner's example of 2026-10-12, checked by hand:
//   € 4,59 / 1,21 = 3,7934 → € 3,79;  4 × € 2,97 = € 11,88 / 1,21 = 9,818 → € 9,82
//   € 60,92 / 1,21 = 50,347 → € 50,35; shipping € 7,45 / 1,21 = 6,157 → € 6,16
//   excl. 3,79 + 9,82 + 50,35 + 6,16 = € 70,12; incl. € 84,84; VAT € 14,72.

import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }) }));

import { GET as adminPdf } from "@/app/beheer/facturen/[id]/pdf/route";
import { GET as examplePdf } from "@/app/beheer/facturen/voorbeeld/route";
import { GET as customerPdf } from "@/app/api/orders/invoice/route";
import { invoiceNumber, negate } from "@/lib/invoices/document";
import { exampleInvoice } from "@/lib/invoices/example";
import { renderInvoicePdf } from "@/lib/invoices/pdf";
import { money } from "@/lib/money";
import { exclusive, MixedVatShipping, vatBreakdown } from "@/lib/pricing/vat";

describe("VAT per product (D-15)", () => {
  it("takes the VAT out of the gross line total, rounded half up", () => {
    expect(exclusive(459, 2100)).toBe(379);
    expect(exclusive(1188, 2100)).toBe(982);
    expect(exclusive(6092, 2100)).toBe(5035);
    expect(exclusive(745, 2100)).toBe(616);
    // 9 %: € 0,66 / 1,09 = 0,6055 → € 0,61.
    expect(exclusive(66, 900)).toBe(61);
    // Exactly half a cent goes up: € 0,01 at 100 % is 0,005 → € 0,01; € 0,03 is 0,015 → € 0,02.
    expect(exclusive(1, 10_000)).toBe(1);
    expect(exclusive(3, 10_000)).toBe(2);
    expect(exclusive(0, 2100)).toBe(0);
  });
  it("a credit is the same amount the other way", () => {
    expect(exclusive(-1188, 2100)).toBe(-982);
  });
  it("the owner's example to the cent: excl. € 70,12, VAT € 14,72, incl. € 84,84", () => {
    const v = vatBreakdown(
      [
        { quantity: 1, unitPrice: money(459), lineTotal: money(459), vatRateBp: 2100 },
        { quantity: 4, unitPrice: money(297), lineTotal: money(1188), vatRateBp: 2100 },
        { quantity: 1, unitPrice: money(6092), lineTotal: money(6092), vatRateBp: 2100 },
      ],
      money(745),
    );
    expect(v.lines.map((l) => [l.unitExcl.amount, l.totalExcl.amount, l.vat.amount])).toEqual([
      [379, 379, 80],
      [245, 982, 206],
      [5035, 5035, 1057],
    ]);
    expect(v.shipping).toEqual({ excl: money(616), incl: money(745), vat: money(129), vatRateBp: 2100 });
    expect(v.byRate).toEqual([{ vatRateBp: 2100, base: money(7012), vat: money(1472) }]);
    expect([v.totalExcl, v.totalVat, v.totalIncl]).toEqual([money(7012), money(1472), money(8484)]);
  });
  it("two rates are grouped apart; shipping with two rates is still open (D-15) and refused, never guessed", () => {
    const lines = [
      { quantity: 1, unitPrice: money(1210), lineTotal: money(1210), vatRateBp: 2100 },
      { quantity: 1, unitPrice: money(1090), lineTotal: money(1090), vatRateBp: 900 },
    ];
    expect(vatBreakdown(lines, money(0)).byRate).toEqual([
      { vatRateBp: 2100, base: money(1000), vat: money(210) },
      { vatRateBp: 900, base: money(1000), vat: money(90) },
    ]);
    expect(() => vatBreakdown(lines, money(595))).toThrow(MixedVatShipping);
  });
});

describe("the invoice document (D-21)", () => {
  it("numbers per year with five digits; a credit note its own series", () => {
    expect(invoiceNumber("invoice", 2026, 1)).toBe("2026-00001");
    expect(invoiceNumber("credit", 2026, 42)).toBe("C2026-00042");
  });
  it("a credit note turns every amount around", () => {
    const n = negate(exampleInvoice());
    expect([n.totalExcl.amount, n.totalVat.amount, n.totalIncl.amount]).toEqual([-7012, -1472, -8484]);
    expect(n.lines[1]!.quantity).toBe(-4);
  });
});

describe("the PDF (docs/FACTUUR.md § Technisch)", () => {
  it("the same invoice gives the same bytes (determinism)", async () => {
    const a = await renderInvoicePdf(exampleInvoice());
    const b = await renderInvoicePdf(exampleInvoice());
    expect(a.subarray(0, 8).toString("latin1")).toBe("%PDF-1.7");
    expect(a.equals(b)).toBe(true);
  });
  it("is tagged, in Dutch, with its title, and small", async () => {
    const pdf = await renderInvoicePdf(exampleInvoice());
    const s = pdf.toString("latin1");
    expect(s).toContain("/StructTreeRoot");
    expect(s).toContain("/MarkInfo");
    expect(s).toMatch(/\/Lang\s*\(nl-NL\)/);
    expect(s).toContain("/DisplayDocTitle true");
    expect(pdf.length).toBeLessThan(100_000);
  });
  it("many lines run onto a second page, with the totals at the end", async () => {
    const base = exampleInvoice();
    const many = { ...base, lines: Array.from({ length: 40 }, () => base.lines[0]!) };
    const s = (await renderInvoicePdf(many)).toString("latin1");
    expect((s.match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("who gets a PDF", () => {
  it("the admin routes: nothing without the permission — the same 404 as an unknown id", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await adminPdf(new Request("http://localhost:3000/beheer/facturen/1/pdf"), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(404);
    expect((await examplePdf(new Request("http://localhost:3000/beheer/facturen/voorbeeld"))).status).toBe(404);
    vi.unstubAllEnvs();
  });
  it("the customer's route: nothing without a valid key (there is no database here)", async () => {
    expect((await customerPdf(new Request("http://localhost:3000/api/orders/invoice?token=x&id=1"))).status).toBe(404);
    expect((await customerPdf(new Request("http://localhost:3000/api/orders/invoice?id=1"))).status).toBe(404);
  });
});
