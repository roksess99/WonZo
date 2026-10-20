// The parts of the admin panel added after the description of 2026-10-12
// was laid next to it: invoice search, the refund clock of a return, and
// asking BigBuy now (docs/BEHEER.md). Without a database.

import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }), cookies: async () => ({ get: () => undefined }) }));

import { lookupPurchaseAction } from "@/app/beheer/bestellingen/actions";
import { searchInvoicesAction } from "@/app/beheer/facturen/actions";
import { parseInvoiceSearch } from "@/lib/invoices";
import { refundClock, refundDeadline } from "@/lib/returns/amount";

describe("what an invoice search term is", () => {
  it("numbers, order numbers, addresses, amounts in euros, names", () => {
    expect(parseInvoiceSearch("2026-00042")).toEqual({ kind: "number", prefix: "2026-00042" });
    expect(parseInvoiceSearch("c2026")).toEqual({ kind: "number", prefix: "C2026" });
    expect(parseInvoiceSearch("wz-2026-00001")).toEqual({ kind: "order", prefix: "WZ-2026-00001" });
    expect(parseInvoiceSearch(" Klant@Example.NL ")).toEqual({ kind: "email", email: "klant@example.nl" });
    // Euros as typed: 37,71 and 37.71 and € 37,71 are all € 37,71; 37 is € 37,00.
    for (const t of ["37,71", "37.71", "€ 37,71"]) expect(parseInvoiceSearch(t)).toEqual({ kind: "amount", cents: 3771 });
    expect(parseInvoiceSearch("37")).toEqual({ kind: "amount", cents: 3700 });
    expect(parseInvoiceSearch("de Vries")).toEqual({ kind: "name", text: "de Vries" });
  });
  it("nothing to search for: empty, one letter, only signs, too long", () => {
    for (const t of ["", " ", "a", "%%", "x".repeat(121)]) expect(parseInvoiceSearch(t)).toBeNull();
  });
});

describe("the refund clock of a return (14 days from the notice)", () => {
  const requested = new Date("2026-10-01T10:00:00Z");
  it("the deadline, and how it stands: ok, within 3 days, past", () => {
    expect(refundDeadline(requested).toISOString()).toBe("2026-10-15T10:00:00.000Z");
    expect(refundClock(requested, new Date("2026-10-11T10:00:00Z"))).toBe("ok");
    expect(refundClock(requested, new Date("2026-10-12T10:00:00Z"))).toBe("soon");
    expect(refundClock(requested, new Date("2026-10-15T10:00:01Z"))).toBe("late");
  });
});

describe("who may search invoices and ask BigBuy (there is no database here)", () => {
  it("both refuse without an admin, before anything is read", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const form = new FormData();
    form.set("zoek", "2026-00001");
    form.set("orderId", "1");
    form.set("supplierOrderId", "00000000-0000-0000-0000-000000000000");
    expect(await searchInvoicesAction({ kind: "idle" }, form)).toEqual({ kind: "denied" });
    expect(await lookupPurchaseAction({ ok: null }, form)).toEqual({ ok: false, error: "access" });
    vi.unstubAllEnvs();
  });
});
