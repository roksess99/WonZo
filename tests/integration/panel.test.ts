// The panel's newer parts against the test database: invoice search, the
// totals on the dashboard, the order list's supplier column, asking BigBuy
// now, and the count of waiting returns (docs/BEHEER.md).

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { lookupPurchase } from "@/lib/admin/order-actions";
import { searchOrders } from "@/lib/admin/orders";
import { getPool, selectRows, toDbTime } from "@/lib/db";
import { invoiceTotals, searchInvoices } from "@/lib/invoices";
import { placeOrder } from "@/lib/orders";
import { openReturnsSummary } from "@/lib/returns";
import { readFunnel } from "@/lib/stats";
import { FakeBigBuy } from "./fake-bigbuy";

afterAll(async () => {
  await getPool().end();
});

describe("searching invoices", () => {
  it("an invoice is found by its number, its order, the customer's address and its amount", async () => {
    const [inv] = await selectRows<{ id: number | string; number: string; total_incl_cents: number | string; reference: string; email: string }>(
      getPool(),
      "SELECT i.id, i.number, i.total_incl_cents, o.reference, o.email FROM invoices i JOIN orders o ON o.id = i.order_id WHERE i.kind = 'invoice' ORDER BY i.id DESC LIMIT 1",
    );
    if (!inv) return; // An empty test database: the invoice tests make the first ones.
    const ids = async (term: string) => (await searchInvoices(getPool(), term))!.map((r) => r.id);
    expect(await ids(inv.number)).toContain(Number(inv.id));
    expect(await ids(inv.reference)).toContain(Number(inv.id));
    expect(await ids(inv.email.toUpperCase())).toContain(Number(inv.id));
    const cents = Number(inv.total_incl_cents);
    expect(await ids(`${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`)).toContain(Number(inv.id));
    // A percent sign is a letter to search for, not "anything".
    expect(await searchInvoices(getPool(), "%%")).toBeNull();
    expect(await ids("x%y")).toEqual([]);
  });

  it("the dashboard's totals: this year always, months only with documents", async () => {
    const t = await invoiceTotals(getPool());
    expect(t.years[0]!.year).toBe(t.year);
    expect(t.months.every((m) => m.documents > 0)).toBe(true);
  });
});

describe("the order list and BigBuy", () => {
  it("each row says whether it is ordered at BigBuy; a purchase without an answer can be asked about now", async () => {
    const customer = { email: `paneel-${randomUUID().slice(0, 8)}@example.nl`, phone: "0612345678", firstName: "Test", lastName: "Paneel", street: "Teststraat", houseNumber: "1", postcode: "1234 AB", city: "Arnhem" };
    const r = await placeOrder({ checkoutAttemptId: randomUUID(), locale: "nl", lines: [{ source: "bigbuy", productId: "1300106", quantity: 1 }], customer }, new Date());
    if (r.kind !== "placed") throw new Error(r.kind);
    expect((await searchOrders(getPool(), customer.email))![0]!.purchase).toBeNull();
    const soId = randomUUID();
    const now = new Date();
    await getPool().query(
      "INSERT INTO supplier_orders (id, order_id, source, reference, status, expected_cost_cents, next_attempt_at, created_at) VALUES (?, ?, 'bigbuy', ?, 'UNKNOWN', 0, ?, ?)",
      [soId, r.orderId, r.reference, toDbTime(now), toDbTime(now)],
    );
    expect((await searchOrders(getPool(), customer.email))![0]!.purchase).toBe("UNKNOWN");
    // Ordering off: nobody to ask, nothing changes.
    expect(await lookupPurchase({ orderId: r.orderId, supplierOrderId: soId, actor: "admin:test" }, null)).toEqual({ ok: false, error: "ordering-off" });
    // BigBuy knows it under our reference: PLACED.
    const bigbuy = new FakeBigBuy();
    bigbuy.placed.set(r.reference, { id: "777001", request: {} as never });
    expect(await lookupPurchase({ orderId: r.orderId, supplierOrderId: soId, actor: "admin:test" }, bigbuy)).toEqual({ ok: true, refund: "none" });
    expect((await searchOrders(getPool(), customer.email))![0]!.purchase).toBe("PLACED");
    expect(bigbuy.callsFor(r.reference, "place")).toBe(0);
    // A second click: no longer UNKNOWN.
    expect(await lookupPurchase({ orderId: r.orderId, supplierOrderId: soId, actor: "admin:test" }, bigbuy)).toEqual({ ok: false, error: "changed" });
  });
});

describe("counts for everyone", () => {
  it("waiting returns: a number and a date, nothing about the customer", async () => {
    const s = await openReturnsSummary(getPool());
    expect(Object.keys(s).sort()).toEqual(["count", "earliestRequestedAt"]);
    expect(s.count === 0 ? s.earliestRequestedAt : s.earliestRequestedAt instanceof Date).toBe(s.count === 0 ? null : true);
  });
  it("the funnel: four numbers", async () => {
    const f = await readFunnel(getPool(), 30);
    expect(Object.values(f).every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
  });
});
