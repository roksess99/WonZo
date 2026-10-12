// Purchasing without a database: the purchase-order machine, the 10 % rule of
// D-04, the guard that keeps a real order from happening by mistake, and how
// BigBuy's answers are read (docs/api/LEVERANCIER.md § 10). The flow itself
// runs against the test database (tests/integration/purchasing.test.ts).

import { describe, expect, it } from "vitest";
import { createdId, lookupAnswer, orderBody, orderingMode, parseCheck, placeAnswer } from "@/lib/catalog/bigbuy/ordering";
import { money } from "@/lib/money";
import { canTransitionSupplierOrder, increasePercent, priceAcceptable } from "@/lib/orders/supplier-states";

describe("the purchase-order machine (docs/STATE_MACHINES.md § Supplier order)", () => {
  it("never sends again without knowing whether the first one arrived", () => {
    for (const actor of ["system", "admin", "reconciliation", "provider"] as const) expect(canTransitionSupplierOrder("UNKNOWN", "SUBMITTING", actor)).toBe(false);
  });
  it("a refusal is tried again (D-04), by the code or the owner — nobody else", () => {
    expect(canTransitionSupplierOrder("REJECTED", "SUBMITTING", "system")).toBe(true);
    expect(canTransitionSupplierOrder("REJECTED", "SUBMITTING", "admin")).toBe(true);
    expect(canTransitionSupplierOrder("REJECTED", "SUBMITTING", "provider")).toBe(false);
  });
  it("nothing is placed without first being recorded as SUBMITTING", () => {
    expect(canTransitionSupplierOrder("DRAFT", "PLACED", "system")).toBe(false);
    expect(canTransitionSupplierOrder("DRAFT", "SUBMITTING", "system")).toBe(true);
  });
  it("an order at the supplier cannot be cancelled from here", () => {
    expect(canTransitionSupplierOrder("PLACED", "CANCELLED", "admin")).toBe(false);
    expect(canTransitionSupplierOrder("DRAFT", "CANCELLED", "admin")).toBe(true);
  });
});

describe("the price (D-04: up to 10 % more is ordered)", () => {
  it("frozen € 10,00: € 11,00 is ordered, € 11,01 waits for the owner", () => {
    expect(priceAcceptable(1000, 1100)).toBe(true);
    expect(priceAcceptable(1000, 1101)).toBe(false);
    expect(priceAcceptable(1000, 900)).toBe(true);
  });
  it("the percentage shown is rounded down: € 10,00 → € 11,59 is 15 %", () => {
    expect(increasePercent(1000, 1159)).toBe(15);
    expect(increasePercent(1000, 900)).toBe(0);
  });
});

describe("SUPPLIER_ORDERING: no real order by mistake", () => {
  const sandbox = { SUPPLIER_API_TOKEN: "t", SUPPLIER_BASE_URL: "https://api.sandbox.bigbuy.eu" };
  const live = { SUPPLIER_API_TOKEN: "t", SUPPLIER_BASE_URL: "https://api.bigbuy.eu" };
  it("is off unless it says otherwise", () => {
    expect(orderingMode({})).toBe("off");
    expect(orderingMode({ ...live, SUPPLIER_ORDERING: "" })).toBe("off");
    expect(() => orderingMode({ SUPPLIER_ORDERING: "yes" })).toThrow(/must be "off", "sandbox" or "live"/);
  });
  it("sandbox only against the sandbox — not against the live address the catalog uses", () => {
    expect(orderingMode({ ...sandbox, SUPPLIER_ORDERING: "sandbox" })).toBe("sandbox");
    expect(() => orderingMode({ ...live, SUPPLIER_ORDERING: "sandbox" })).toThrow(/api\.sandbox\.bigbuy\.eu/);
  });
  it("live only in production, against the live address", () => {
    expect(() => orderingMode({ ...live, SUPPLIER_ORDERING: "live", NODE_ENV: "development" })).toThrow(/outside production/);
    expect(() => orderingMode({ ...sandbox, SUPPLIER_ORDERING: "live", NODE_ENV: "production" })).toThrow(/api\.bigbuy\.eu/);
    expect(orderingMode({ ...live, SUPPLIER_ORDERING: "live", NODE_ENV: "production" })).toBe("live");
  });
  it("needs a token and an address", () => {
    expect(() => orderingMode({ SUPPLIER_ORDERING: "sandbox" })).toThrow(/needs SUPPLIER_API_TOKEN/);
  });
});

describe("BigBuy's answers", () => {
  const req = {
    reference: "WZ-2026-00012",
    lines: [{ sku: "S1300106", quantity: 2 }],
    address: { firstName: "Test", lastName: "Klant", street: "Teststraat", houseNumber: "1a", postcode: "1234 AB", city: "Arnhem", country: "NL", phone: "0612345678", email: "k@example.nl" },
    language: "nl" as const,
  };
  it("the order: our reference, paid from the balance, street and number together, postcode without a space", () => {
    expect(orderBody(req)).toEqual({
      order: {
        internalReference: "WZ-2026-00012",
        language: "nl",
        paymentMethod: "moneybox",
        shippingAddress: { firstName: "Test", lastName: "Klant", country: "NL", postcode: "1234AB", town: "Arnhem", address: "Teststraat 1a", phone: "0612345678", email: "k@example.nl" },
        products: [{ reference: "S1300106", quantity: 2 }],
      },
    });
  });
  it("a check's totals are JSON numbers, read exactly to cents", () => {
    expect(parseCheck({ totalWithoutTaxesAndWithoutShippingCost: 18.22, totalWithoutTaxes: 26.8, total: 32.43 })).toEqual({ kind: "ok", products: money(1822), total: money(3243) });
    expect(parseCheck({ total: 1 })).toEqual({ kind: "unknown" });
  });
  it("the created id comes from the Location header, else from the body", () => {
    expect(createdId("https://api.bigbuy.eu/rest/order/1234567", null)).toBe("1234567");
    expect(createdId("/rest/order/1234567.json", null)).toBe("1234567");
    expect(createdId(null, { order_id: 42 })).toBe("42");
    expect(createdId(null, {})).toBeNull();
  });
  it("placing: 201 is placed; a 409, 429, 5xx, timeout or a 201 without an id is unknown; another 4xx is a refusal", () => {
    expect(placeAnswer({ status: 201, json: null, location: "/rest/order/9" })).toEqual({ kind: "placed", supplierOrderRef: "9" });
    expect(placeAnswer({ status: 201, json: null, location: null })).toEqual({ kind: "unknown" });
    for (const status of [409, 429, 500, 503, "timeout", "network"] as const) expect(placeAnswer({ status, json: null, location: null })).toEqual({ kind: "unknown" });
    expect(placeAnswer({ status: 400, json: { code: 400, message: "Insufficient balance" }, location: null })).toEqual({ kind: "refused", status: 400, message: "Insufficient balance" });
  });
  it("looking up: only a 404 proves nothing arrived (the sandbox answers 500)", () => {
    expect(lookupAnswer({ status: 200, json: { id: "9", totalPaidTaxIncl: "32.43" }, location: null })).toEqual({ kind: "found", supplierOrderRef: "9" });
    expect(lookupAnswer({ status: 404, json: null, location: null })).toEqual({ kind: "absent" });
    expect(lookupAnswer({ status: 500, json: null, location: null })).toEqual({ kind: "unknown" });
  });
});
