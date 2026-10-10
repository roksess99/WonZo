// Orders against the real test database (docs/TESTEN.md § Integration):
// migrations, unique keys, compare-and-set under concurrency, the counter
// under concurrency, the cancel window. Every test makes its own orders
// (a fresh checkout key) and checks only those, so runs can follow each other
// on the same database without cleaning up.

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPool, selectRows, withTransaction } from "@/lib/db";
import { nextNumber } from "@/lib/db/counters";
import { parseCustomer, type CustomerDetails } from "@/lib/orders/customer";
import { placeOrder, releaseClosedWindows } from "@/lib/orders";
import { changeCustomerDetails, ConcurrentChangeError, findOrderIdByToken, transitionOrder, TransitionError } from "@/lib/orders/store";
import { CANCEL_WINDOW_MS } from "@/lib/orders/states";

afterAll(async () => {
  await getPool().end();
});

const customer = {
  email: "test@example.nl", phone: "0612345678", firstName: "Test", lastName: "Klant",
  street: "Teststraat", houseNumber: "1", postcode: "1234 AB", city: "Arnhem",
};
const lines = [
  { source: "bigbuy", productId: "1300118", quantity: 2 },
  { source: "bigbuy", productId: "1300104", quantity: 1 },
];
const request = (over: Record<string, unknown> = {}) => ({ checkoutAttemptId: randomUUID(), locale: "nl", lines, customer, ...over });

async function placed(input: unknown, now = new Date()) {
  const r = await placeOrder(input, now);
  if (r.kind !== "placed") throw new Error(`expected placed, got ${r.kind}`);
  return r;
}
const count = async (sql: string, params: unknown[]) => Number((await selectRows<{ n: number }>(getPool(), sql, params))[0]!.n);
const status = async (id: number) => (await selectRows<{ status: string }>(getPool(), "SELECT status FROM orders WHERE id = ?", [id]))[0]!.status;
const pay = (orderId: number, now: Date) => withTransaction((conn) => transitionOrder(conn, { orderId, to: "PAID", actor: "provider", now }));

describe("schema", () => {
  it("has every migration applied, from empty to now", async () => {
    const ids = (await selectRows<{ id: string }>(getPool(), "SELECT id FROM schema_migrations ORDER BY id")).map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["0001_catalog", "0002_orders"]));
  });
});

describe("placing an order", () => {
  it("stores the frozen order, its lines and the first status line", async () => {
    const r = await placed(request());
    expect(r.reference).toMatch(/^WZ-\d{4}-\d{5,}$/);
    const [o] = await selectRows<Record<string, unknown>>(getPool(), "SELECT status, subtotal_cents, shipping_standard_cents, shipping_large_cents, total_cents, postcode FROM orders WHERE id = ?", [r.orderId]);
    // By hand: 2 × € 29,99 + € 99,99 = € 159,97; standard free; bed € 63,80 → € 223,77.
    expect(o).toEqual({ status: "PENDING_PAYMENT", subtotal_cents: 15997, shipping_standard_cents: 0, shipping_large_cents: 6380, total_cents: 22377, postcode: "1234 AB" });
    expect(await count("SELECT COUNT(*) AS n FROM order_lines WHERE order_id = ?", [r.orderId])).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM order_events WHERE order_id = ? AND to_status = 'PENDING_PAYMENT'", [r.orderId])).toBe(1);
    expect(await findOrderIdByToken(getPool(), r.accessToken)).toBe(r.orderId);
  });

  it("gives the same order for the same key, with a new key for the link that also works", async () => {
    const body = request();
    const first = await placed(body);
    const second = await placed(body);
    expect(second).toMatchObject({ orderId: first.orderId, reference: first.reference, replay: true });
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(await findOrderIdByToken(getPool(), first.accessToken)).toBe(first.orderId);
    expect(await findOrderIdByToken(getPool(), second.accessToken)).toBe(first.orderId);
  });

  it("makes one order of five submits at the same moment", async () => {
    const body = request();
    const results = await Promise.all(Array.from({ length: 5 }, () => placed(body)));
    expect(new Set(results.map((r) => r.orderId)).size).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM orders WHERE checkout_attempt_id = ?", [body.checkoutAttemptId])).toBe(1);
  });

  it("refuses the same key with other content, and changes nothing", async () => {
    const body = request();
    const first = await placed(body);
    expect(await placeOrder({ ...body, lines: [lines[0]] })).toEqual({ kind: "conflict" });
    expect(await count("SELECT COUNT(*) AS n FROM order_lines WHERE order_id = ?", [first.orderId])).toBe(2);
  });

  it("stores nothing for a cart that is no longer what the customer saw", async () => {
    const body = request({ lines: [{ source: "bigbuy", productId: "1300106", quantity: 8 }] }); // 7 in stock
    expect((await placeOrder(body)).kind).toBe("not-ready");
    expect(await count("SELECT COUNT(*) AS n FROM orders WHERE checkout_attempt_id = ?", [body.checkoutAttemptId])).toBe(0);
  });

  it("opens nothing with an unknown or malformed key", async () => {
    expect(await findOrderIdByToken(getPool(), "x".repeat(43))).toBeNull();
    expect(await findOrderIdByToken(getPool(), "kort")).toBeNull();
  });
});

describe("the counter", () => {
  it("hands out 1..10 to ten transactions at the same moment", async () => {
    const series = `t${randomUUID().slice(0, 8)}`;
    const numbers = await Promise.all(Array.from({ length: 10 }, () => withTransaction((conn) => nextNumber(conn, series, 2026))));
    expect([...numbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("gives a number back when the document's transaction rolls back: no gap", async () => {
    const series = `t${randomUUID().slice(0, 8)}`;
    expect(await withTransaction((conn) => nextNumber(conn, series, 2026))).toBe(1);
    await expect(
      withTransaction(async (conn) => {
        await nextNumber(conn, series, 2026);
        throw new Error("document failed");
      }),
    ).rejects.toThrow("document failed");
    expect(await withTransaction((conn) => nextNumber(conn, series, 2026))).toBe(2);
  });
});

describe("status changes", () => {
  it("refuses a transition that does not exist, and writes nothing", async () => {
    const r = await placed(request());
    await expect(withTransaction((conn) => transitionOrder(conn, { orderId: r.orderId, to: "FULFILLMENT_PENDING", actor: "system", now: new Date() }))).rejects.toThrow(TransitionError);
    expect(await status(r.orderId)).toBe("PENDING_PAYMENT");
    expect(await count("SELECT COUNT(*) AS n FROM order_events WHERE order_id = ?", [r.orderId])).toBe(1);
  });

  it("on payment: sets the window, writes the confirmation to the outbox once, and a repeat is a no-op", async () => {
    const r = await placed(request());
    const now = new Date();
    expect(await pay(r.orderId, now)).toEqual({ changed: true, from: "PENDING_PAYMENT" });
    expect(await pay(r.orderId, now)).toEqual({ changed: false, from: "PAID" });
    const [o] = await selectRows<{ paid_at: string; cancel_window_ends_at: string }>(getPool(), "SELECT paid_at, cancel_window_ends_at FROM orders WHERE id = ?", [r.orderId]);
    expect(new Date(`${o!.cancel_window_ends_at.replace(" ", "T")}Z`).getTime() - new Date(`${o!.paid_at.replace(" ", "T")}Z`).getTime()).toBe(CANCEL_WINDOW_MS);
    const kinds = await selectRows<{ kind: string }>(getPool(), "SELECT kind FROM outbox WHERE dedupe_key = ? ORDER BY kind", [`order:${r.orderId}`]);
    expect(kinds.map((k) => k.kind)).toEqual(["admin-new-order", "order-confirmation"]);
    expect(await count("SELECT COUNT(*) AS n FROM order_events WHERE order_id = ? AND to_status = 'PAID'", [r.orderId])).toBe(1);
  });

  it("lets exactly one of two simultaneous transitions through (compare-and-set)", async () => {
    const r = await placed(request());
    const now = new Date();
    const results = await Promise.allSettled([
      pay(r.orderId, now),
      withTransaction((conn) => transitionOrder(conn, { orderId: r.orderId, to: "PAYMENT_FAILED", actor: "provider", now })),
    ]);
    const won = results.filter((x) => x.status === "fulfilled" && x.value.changed);
    const lost = results.filter((x) => x.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason).toSatisfy((e: unknown) => e instanceof ConcurrentChangeError || e instanceof TransitionError);
    expect(await count("SELECT COUNT(*) AS n FROM order_events WHERE order_id = ?", [r.orderId])).toBe(2);
  });

  it("holds a paid order: no way out of PAID, and the window job skips it", async () => {
    const r = await placed(request());
    const now = new Date();
    await pay(r.orderId, now);
    await getPool().query("UPDATE orders SET hold_reason = 'AMOUNT_MISMATCH' WHERE id = ?", [r.orderId]);
    await expect(withTransaction((conn) => transitionOrder(conn, { orderId: r.orderId, to: "FULFILLMENT_PENDING", actor: "system", now }))).rejects.toThrow(/on hold/);
    const later = new Date(now.getTime() + CANCEL_WINDOW_MS + 60_000);
    expect((await releaseClosedWindows(later)).released).not.toContain(r.orderId);
    expect(await status(r.orderId)).toBe("PAID");
  });
});

describe("the 30-minute window (D-04)", () => {
  const moved = (parseCustomer({ ...customer, street: "Nieuwe Straat", houseNumber: "2" }) as { customer: CustomerDetails }).customer;

  it("lets the customer change the address inside the window, with an audit line without the values", async () => {
    const r = await placed(request());
    const now = new Date();
    await pay(r.orderId, now);
    const result = await withTransaction((conn) => changeCustomerDetails(conn, { orderId: r.orderId, customer: moved, now: new Date(now.getTime() + 10 * 60_000) }));
    expect(result).toEqual({ ok: true, changed: ["street", "house_number"] });
    const [o] = await selectRows<{ street: string }>(getPool(), "SELECT street FROM orders WHERE id = ?", [r.orderId]);
    expect(o!.street).toBe("Nieuwe Straat");
    const [audit] = await selectRows<{ after_state: unknown }>(getPool(), "SELECT after_state FROM audit_log WHERE object_type = 'order' AND object_id = ? ORDER BY id DESC LIMIT 1", [String(r.orderId)]);
    // GEMETEN 2026-10-10: mysql2 hands a MariaDB JSON column back already parsed (an object, not text).
    const after = typeof audit!.after_state === "string" ? JSON.parse(audit!.after_state) : audit!.after_state;
    expect(after).toEqual({ fields: ["street", "house_number"] });
    expect(JSON.stringify(after)).not.toContain("Nieuwe Straat");
  });

  it("refuses a change when the window has closed, and before payment", async () => {
    const r = await placed(request());
    const now = new Date();
    expect(await withTransaction((conn) => changeCustomerDetails(conn, { orderId: r.orderId, customer: moved, now }))).toEqual({ ok: false, reason: "window-closed" });
    await pay(r.orderId, now);
    const atEnd = new Date(now.getTime() + CANCEL_WINDOW_MS);
    expect(await withTransaction((conn) => changeCustomerDetails(conn, { orderId: r.orderId, customer: moved, now: atEnd }))).toEqual({ ok: false, reason: "window-closed" });
  });

  it("moves the order on to purchasing after the window, once, with the invoice and purchase in the outbox", async () => {
    const r = await placed(request());
    const now = new Date();
    await pay(r.orderId, now);
    expect((await releaseClosedWindows(new Date(now.getTime() + 60_000))).released).not.toContain(r.orderId);
    const after = new Date(now.getTime() + CANCEL_WINDOW_MS + 1);
    expect((await releaseClosedWindows(after)).released).toContain(r.orderId);
    expect((await releaseClosedWindows(after)).released).not.toContain(r.orderId);
    expect(await status(r.orderId)).toBe("FULFILLMENT_PENDING");
    const kinds = (await selectRows<{ kind: string }>(getPool(), "SELECT kind FROM outbox WHERE dedupe_key = ? ORDER BY kind", [`order:${r.orderId}`])).map((k) => k.kind);
    expect(kinds).toEqual(["admin-new-order", "invoice", "order-confirmation", "supplier-order"]);
  });
});
