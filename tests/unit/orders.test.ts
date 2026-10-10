import { describe, expect, it } from "vitest";
import { quoteCart } from "@/lib/cart/quote";
import { getCatalog, getSupplierCosts } from "@/lib/catalog/provider";
import { amsterdamYear, orderReference } from "@/lib/db/counters";
import { parseCustomer, type CustomerDetails } from "@/lib/orders/customer";
import { freeze, requestHash, SnapshotError } from "@/lib/orders/snapshot";
import { ACTORS, blockedByHold, canTransition, CANCEL_WINDOW_MS, insideCancelWindow, ORDER_STATUSES, type OrderStatus } from "@/lib/orders/states";

const anyActor = (from: OrderStatus, to: OrderStatus) => ACTORS.some((a) => canTransition(from, to, a));

describe("order state machine (docs/STATE_MACHINES.md § Order)", () => {
  it("allows the transitions of the table", () => {
    expect(canTransition("PENDING_PAYMENT", "PAID", "provider")).toBe(true);
    expect(canTransition("PAYMENT_FAILED", "PENDING_PAYMENT", "customer")).toBe(true);
    expect(canTransition("PAID", "FULFILLMENT_PENDING", "system")).toBe(true);
    expect(canTransition("PAID", "CANCELLED", "customer")).toBe(true); // D-04: inside the window
    expect(canTransition("DELIVERED", "COMPLETED", "system")).toBe(true);
  });

  it("refuses the forbidden examples", () => {
    expect(anyActor("PENDING_PAYMENT", "FULFILLMENT_PENDING")).toBe(false); // skipping the payment
    expect(anyActor("PAID", "PENDING_PAYMENT")).toBe(false); // back to unpaid, also on a late "pending"
    expect(anyActor("PURCHASED", "CANCELLED")).toBe(false); // purchase orders not cancelled
    for (const to of ORDER_STATUSES) {
      expect(anyActor("CANCELLED", to)).toBe(false);
      expect(anyActor("COMPLETED", to)).toBe(false);
    }
  });

  it("lets only the payment provider (or reconciliation) confirm a payment, never the customer's return URL", () => {
    expect(canTransition("PENDING_PAYMENT", "PAID", "customer")).toBe(false);
    expect(canTransition("PENDING_PAYMENT", "PAID", "admin")).toBe(false);
  });

  it("lets the customer cancel a paid order, but never after purchasing started", () => {
    expect(canTransition("FULFILLMENT_PENDING", "CANCELLED", "customer")).toBe(false);
    expect(canTransition("FULFILLMENT_PENDING", "CANCELLED", "admin")).toBe(true);
  });

  it("blocks every way out of PAID while a hold is set", () => {
    expect(blockedByHold("PAID", "AMOUNT_MISMATCH")).toBe(true);
    expect(blockedByHold("PAID", null)).toBe(false);
    expect(blockedByHold("FULFILLMENT_PENDING", "FRAUD_REVIEW")).toBe(false);
  });

  it("keeps the cancel window to exactly 30 minutes after payment (D-04)", () => {
    const paid = new Date("2026-10-10T10:00:00.000Z");
    const ends = new Date(paid.getTime() + CANCEL_WINDOW_MS);
    expect(ends.toISOString()).toBe("2026-10-10T10:30:00.000Z");
    expect(insideCancelWindow("PAID", null, ends, new Date("2026-10-10T10:29:59.999Z"))).toBe(true);
    expect(insideCancelWindow("PAID", null, ends, ends)).toBe(false);
    expect(insideCancelWindow("PAID", "AMOUNT_MISMATCH", ends, paid)).toBe(false);
    expect(insideCancelWindow("FULFILLMENT_PENDING", null, ends, paid)).toBe(false);
  });
});

const valid = {
  email: "  klant@example.nl ",
  phone: "06-12 34 56 78",
  firstName: "Sanne",
  lastName: "de  Vries",
  street: "Dorpsstraat",
  houseNumber: "12a",
  postcode: "1234ab",
  city: "Arnhem",
};

describe("customer details at the edge", () => {
  it("accepts a Dutch address and normalises it", () => {
    const r = parseCustomer(valid);
    expect(r).toEqual({
      ok: true,
      customer: {
        email: "klant@example.nl", phone: "0612345678", firstName: "Sanne", lastName: "de Vries",
        street: "Dorpsstraat", houseNumber: "12a", postcode: "1234 AB", city: "Arnhem", country: "NL",
      },
    });
  });

  it("names every field that is wrong, and stores nothing half", () => {
    const r = parseCustomer({ ...valid, email: "geen-mail", postcode: "0123 AB", phone: "12", city: "", houseNumber: "a12" });
    expect(r).toEqual({ ok: false, errors: { email: "invalid", postcode: "invalid", phone: "invalid", city: "required", houseNumber: "invalid" } });
  });

  it("refuses an address outside the Netherlands (D-14), control characters and too long values", () => {
    expect(parseCustomer({ ...valid, country: "BE" })).toMatchObject({ ok: false, errors: { country: "invalid" } });
    expect(parseCustomer({ ...valid, street: "Dorps\u0000straat" })).toMatchObject({ ok: false, errors: { street: "invalid" } });
    expect(parseCustomer({ ...valid, city: "x".repeat(101) })).toMatchObject({ ok: false, errors: { city: "too-long" } });
    expect(parseCustomer(null)).toMatchObject({ ok: false });
  });
});

describe("the frozen snapshot", () => {
  const lines = [
    { source: "bigbuy" as const, productId: "1300118", quantity: 2 },
    { source: "bigbuy" as const, productId: "1300104", quantity: 1 },
  ];

  it("freezes what the quote showed, with the supplier's cost per piece", async () => {
    const products = await getCatalog("nl");
    const snap = freeze(quoteCart(lines, products), products, await getSupplierCosts(lines));
    // By hand: 2 × € 29,99 = € 59,98 + € 99,99 = € 159,97 subtotal (≥ € 50: the
    // standard parcel is free); the bed is a large item: € 63,80 own shipping;
    // total € 223,77.
    expect(snap.subtotal.amount).toBe(15997);
    expect(snap.shippingStandard.amount).toBe(0);
    expect(snap.shippingLarge.amount).toBe(6380);
    expect(snap.total.amount).toBe(22377);
    expect(snap.lines.map((l) => [l.lineNo, l.productId, l.quantity, l.unitPrice.amount, l.lineTotal.amount, l.supplierCost.amount, l.largeShipping?.amount ?? null])).toEqual([
      [1, "1300118", 2, 2999, 5998, 1235, null],
      [2, "1300104", 1, 9999, 9999, 2492, 6380],
    ]);
    expect(snap.lines[0]!.offerId).toBe(products.find((p) => p.id === "1300118")!.offerId);
  });

  it("charges standard shipping below the threshold", async () => {
    const one = [{ source: "bigbuy" as const, productId: "1300106", quantity: 1 }];
    const products = await getCatalog("nl");
    const snap = freeze(quoteCart(one, products), products, await getSupplierCosts(one));
    // By hand: € 18,50 + € 5,95 = € 24,45.
    expect([snap.subtotal.amount, snap.shippingStandard.amount, snap.total.amount]).toEqual([1850, 595, 2445]);
  });

  it("refuses a quote that is not ready, and a line without a cost", async () => {
    const products = await getCatalog("nl");
    const tooMany = [{ source: "bigbuy" as const, productId: "1300106", quantity: 8 }]; // 7 in stock
    expect(() => freeze(quoteCart(tooMany, products), products, new Map())).toThrow(SnapshotError);
    expect(() => freeze(quoteCart(lines, products), products, new Map())).toThrow(SnapshotError);
  });

  it("hashes the request regardless of line order, and changes with the details", () => {
    const customer = (parseCustomer(valid) as { customer: CustomerDetails }).customer;
    const a = requestHash("nl", lines, customer);
    expect(requestHash("nl", [...lines].reverse(), customer)).toBe(a);
    expect(requestHash("nl", lines, { ...customer, city: "Ede" })).not.toBe(a);
    expect(requestHash("en", lines, customer)).not.toBe(a);
  });
});

describe("order numbers", () => {
  it("look like WZ-2026-00001 and follow the Dutch calendar year", () => {
    expect(orderReference(2026, 1)).toBe("WZ-2026-00001");
    expect(orderReference(2026, 123456)).toBe("WZ-2026-123456");
    expect(amsterdamYear(new Date("2026-12-31T23:30:00Z"))).toBe(2027); // 00:30 on 1 January in Amsterdam
    expect(amsterdamYear(new Date("2026-12-31T22:30:00Z"))).toBe(2026);
  });
});
