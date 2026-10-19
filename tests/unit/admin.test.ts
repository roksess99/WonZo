// The admin panel without a database: who may do what, when the panel opens
// without logging in, how the health of Mollie and BigBuy is read, and which
// buttons an order gets (D-07, docs/BEHEER.md). The actions themselves run
// against the test database (tests/integration/admin.test.ts).

import { afterEach, describe, expect, it, vi } from "vitest";

let host = "localhost:3000";
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host }) }));

import { cancelAndRefundAction, markDeliveredAction, refundPaymentAction, releaseHoldAction, searchAction } from "@/app/beheer/bestellingen/actions";
import { AdminAccessDenied, authorize, currentAdmin, devLoginAllowed, isLocalHost, requireAction, requirePage, type Admin } from "@/lib/admin/access";
import { adminOptions, cleanReason, openOnPayment } from "@/lib/admin/order-actions";
import { amsterdamMonthStart, parseOrderSearch, type AdminOrder } from "@/lib/admin/orders";
import { can, OWNER_ONLY, PERMISSIONS, ROLES } from "@/lib/admin/permissions";
import { parseBalance, QUIET_AFTER_MS, stateFromCalls } from "@/lib/catalog/bigbuy/health";
import { money } from "@/lib/money";
import { canTakePayments, healthFromAnswer } from "@/lib/payments/health";
import { parseActiveMethods } from "@/lib/payments/mollie";

afterEach(() => {
  vi.unstubAllEnvs();
  host = "localhost:3000";
});

describe("permissions (D-07: three fixed roles)", () => {
  it("the owner may everything; the bookkeeper only invoices; marketing only promotions, reviews and statistics", () => {
    expect(PERMISSIONS.every((p) => can("eigenaar", p))).toBe(true);
    expect(PERMISSIONS.filter((p) => can("boekhouder", p))).toEqual(["facturen"]);
    expect(PERMISSIONS.filter((p) => can("marketing", p))).toEqual(["kortingen", "beoordelingen", "statistieken"]);
  });

  it("refunds, prices, admins and returns stay with the owner, whatever the matrix says", () => {
    for (const role of ROLES.filter((r) => r !== "eigenaar")) for (const p of OWNER_ONLY) expect(can(role, p)).toBe(false);
  });

  it("authorize: nobody and the wrong role are refused, the right role passes", () => {
    const marketing: Admin = { id: "2", name: "M", role: "marketing", actor: "admin:2" };
    const owner: Admin = { id: "1", name: "E", role: "eigenaar", actor: "admin:1" };
    expect(() => authorize(null, "bestellingen")).toThrow(AdminAccessDenied);
    expect(() => authorize(marketing, "terugbetalen")).toThrow(AdminAccessDenied);
    expect(() => authorize(marketing, "bestellingen")).toThrow(AdminAccessDenied);
    expect(authorize(owner, "terugbetalen")).toBe(owner);
  });
});

describe("the panel without logging in (only local, until 6a)", () => {
  it("knows a local address, with or without a port", () => {
    for (const h of ["localhost", "localhost:3000", "127.0.0.1:3000", "[::1]:3000", "LOCALHOST:3000"]) expect(isLocalHost(h)).toBe(true);
    for (const h of ["wonzo.nl", "localhost.wonzo.nl", "127.0.0.2", "", null]) expect(isLocalHost(h)).toBe(false);
  });

  it("needs pnpm dev, ADMIN_DEV_LOGIN=true and localhost — all three", () => {
    const dev = { NODE_ENV: "development", ADMIN_DEV_LOGIN: "true" };
    expect(devLoginAllowed(dev, "localhost:3000")).toBe(true);
    expect(devLoginAllowed({ ...dev, NODE_ENV: "production" }, "localhost:3000")).toBe(false);
    expect(devLoginAllowed({ ...dev, ADMIN_DEV_LOGIN: "1" }, "localhost:3000")).toBe(false);
    expect(devLoginAllowed({ NODE_ENV: "development" }, "localhost:3000")).toBe(false);
    expect(devLoginAllowed(dev, "wonzo.nl")).toBe(false);
  });

  it("in production nobody is an admin, also on localhost with the setting on", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_DEV_LOGIN", "true");
    expect(await currentAdmin()).toBeNull();
    await expect(requireAction("bestellingen")).rejects.toThrow(AdminAccessDenied);
    // notFound(): the panel does not exist for a stranger.
    await expect(requirePage(null)).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it("locally with the setting: the owner; from another host: nobody", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ADMIN_DEV_LOGIN", "true");
    expect((await currentAdmin())?.role).toBe("eigenaar");
    host = "wonzo.nl";
    expect(await currentAdmin()).toBeNull();
  });

  it("every action refuses without an admin, before anything is read or written (there is no database here)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const form = new FormData();
    form.set("orderId", "1");
    form.set("expectedRefundCents", "2445");
    form.set("paymentId", "00000000-0000-0000-0000-000000000000");
    form.set("reason", "test");
    form.set("zoek", "WZ-2026-00001");
    expect(await searchAction({ kind: "idle" }, form)).toEqual({ kind: "denied" });
    for (const act of [releaseHoldAction, cancelAndRefundAction, refundPaymentAction, markDeliveredAction]) expect(await act({ ok: null }, form)).toEqual({ ok: false, error: "access" });
  });
});

describe("does Mollie take payments (not: is there a key)", () => {
  const live = { apiKey: "live_x", testMode: false };
  it("reads the methods list, only activated ones count", () => {
    expect(
      parseActiveMethods({
        _embedded: {
          methods: [
            { id: "ideal", status: "activated" },
            { id: "creditcard", status: "pending-review" },
            { id: "applepay", status: "activated" },
          ],
        },
      }),
    ).toEqual(["ideal", "applepay"]);
    expect(parseActiveMethods({ error: "x" })).toBeNull();
  });

  it("all of D-05 active: ok; one under review: a warning, checkout still open; none: checkout closed", () => {
    expect(healthFromAnswer(live, { kind: "ok", active: ["ideal", "applepay", "creditcard", "bancontact"] })).toEqual({ state: "ok", testMode: false });
    const partly = healthFromAnswer(live, { kind: "ok", active: ["ideal"] });
    expect(partly).toEqual({ state: "methods-inactive", testMode: false, inactive: ["applepay", "creditcard"], active: ["ideal"] });
    expect(canTakePayments(partly)).toBe(true);
    expect(canTakePayments(healthFromAnswer(live, { kind: "ok", active: [] }))).toBe(false);
    expect(canTakePayments(healthFromAnswer(live, { kind: "refused", status: 401 }))).toBe(false);
    expect(canTakePayments(healthFromAnswer(live, { kind: "unreachable" }))).toBe(false);
  });
});

describe("does BigBuy work, from the calls the catalog already makes", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000);
  it("a refused token since the first refusal in a row", () => {
    expect(stateFromCalls([{ status: 401, at: at(1) }, { status: 401, at: at(5) }, { status: 200, at: at(9) }], now)).toEqual({ state: "refused", since: at(5) });
  });
  it("one timeout is weather, three in a row is the service", () => {
    expect(stateFromCalls([{ status: null, at: at(1) }, { status: 200, at: at(2) }], now).state).toBe("ok");
    expect(stateFromCalls([{ status: null, at: at(1) }, { status: 503, at: at(2) }, { status: null, at: at(3) }, { status: 200, at: at(4) }], now)).toEqual({ state: "unreachable", since: at(3) });
  });
  it("a 404 (no data) or 429 (limit) is an answer: the token works", () => {
    expect(stateFromCalls([{ status: 404, at: at(1) }], now).state).toBe("ok");
    expect(stateFromCalls([{ status: 429, at: at(1) }], now).state).toBe("ok");
  });
  it("no call in six hours: the catalog job is not running", () => {
    expect(stateFromCalls([], now)).toEqual({ state: "quiet", lastContact: null });
    expect(stateFromCalls([{ status: 200, at: new Date(now.getTime() - QUIET_AFTER_MS - 1) }], now).state).toBe("quiet");
  });
  it("the balance comes as a string with two decimals, exactly to cents", () => {
    expect(parseBalance("10000.00")).toEqual(money(1_000_000));
    expect(parseBalance("0.00")).toEqual(money(0));
    expect(parseBalance(12.5)).toBeNull();
    expect(parseBalance("-1.00")).toBeNull();
  });
});

describe("searching and counting", () => {
  it("an order number (or its start) or a whole e-mail address; anything else is refused", () => {
    expect(parseOrderSearch(" wz-2026-00012 ")).toEqual({ kind: "reference", prefix: "WZ-2026-00012" });
    expect(parseOrderSearch("WZ-2026")).toEqual({ kind: "reference", prefix: "WZ-2026" });
    expect(parseOrderSearch("Klant@Example.NL")).toEqual({ kind: "email", email: "klant@example.nl" });
    for (const t of ["", "klant", "%", "WZ-%", "a@b"]) expect(parseOrderSearch(t)).toBeNull();
  });
  it("this month starts at midnight Dutch time, also across a change of summer time", () => {
    // 1 October 2026 00:00 in Amsterdam is summer time (UTC+2): 30 September 22:00 UTC.
    expect(amsterdamMonthStart(new Date("2026-10-12T10:00:00Z")).toISOString()).toBe("2026-09-30T22:00:00.000Z");
    // 1 November 2026 00:00 is winter time (UTC+1): 31 October 23:00 UTC.
    expect(amsterdamMonthStart(new Date("2026-11-05T10:00:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    // 00:30 on 1 November in Amsterdam is still 31 October in UTC, but already November here.
    expect(amsterdamMonthStart(new Date("2026-10-31T23:30:00Z")).toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });
});

describe("which buttons an order gets", () => {
  const pay = (id: string, status: AdminOrder["payments"][number]["status"], cents: number) => ({ id, status, amount: money(cents), method: null, providerPaymentId: null, createdAt: new Date() });
  const order = (o: Partial<AdminOrder>): AdminOrder =>
    ({ status: "PAID", holdReason: null, payments: [pay("p1", "PAID", 2445)], refunds: [], purchases: [], failedMails: [], invoices: [], ...o }) as AdminOrder;
  const none = { acceptPrice: null, retryPurchase: null, resendMails: [], markDelivered: false, lookupPurchase: null };

  it("a reason has at least 3 characters, at most 200", () => {
    expect(cleanReason("  ok  ")).toBeNull();
    expect(cleanReason(" klant  belde ")).toBe("klant belde");
    expect(cleanReason("x".repeat(201))).toBeNull();
    expect(cleanReason(null)).toBeNull();
  });

  it("a paid order: cancel with the whole amount back — € 24,45", () => {
    expect(adminOptions(order({}))).toEqual({ releaseHold: false, cancel: { refund: money(2445) }, refundPayments: [], heldUnpaid: false, ...none });
  });

  it("what is left: paid minus every refund that did not fail — € 24,45 − € 10,00 = € 14,45", () => {
    const o = order({ refunds: [
      { id: "r1", paymentId: "p1", status: "SUCCEEDED", amount: money(1000), reason: "x", requestedBy: "x", providerRefundId: null, createdAt: new Date() },
      { id: "r2", paymentId: "p1", status: "FAILED", amount: money(500), reason: "x", requestedBy: "x", providerRefundId: null, createdAt: new Date() },
    ] });
    expect(openOnPayment(o, "p1")).toEqual(money(1445));
  });

  it("a chargeback hold on a paid order: lift the hold, or cancel without a refund (the money is back already)", () => {
    const o = order({ holdReason: "CHARGEBACK", payments: [pay("p1", "CHARGED_BACK", 2445)] });
    expect(adminOptions(o)).toEqual({ releaseHold: true, cancel: { refund: money(0) }, refundPayments: [], heldUnpaid: false, ...none });
  });

  it("a second payment on a paid order: that one can be paid back on its own", () => {
    const o = order({ payments: [pay("p1", "PAID", 2445), pay("p2", "PAID", 2445)] });
    expect(adminOptions(o).refundPayments).toEqual([{ paymentId: "p2", open: money(2445) }]);
  });

  it("paid after the order was cancelled: pay it back; no cancel, no hold to lift", () => {
    const o = order({ status: "CANCELLED", payments: [pay("p1", "PAID", 2445)] });
    expect(adminOptions(o)).toEqual({ releaseHold: false, cancel: null, refundPayments: [{ paymentId: "p1", open: money(2445) }], heldUnpaid: false, ...none });
  });

  it("a different amount before the order was paid: cancel, with everything that came in back (owner 2026-10-13)", () => {
    // € 1,00 and € 23,45 paid on a € 24,45 order: € 24,45 back in two refunds.
    const o = order({ status: "PENDING_PAYMENT", holdReason: "AMOUNT_MISMATCH", payments: [pay("p1", "PAID", 100), pay("p2", "PAID", 2345)] });
    expect(adminOptions(o)).toEqual({ releaseHold: false, cancel: { refund: money(2445) }, refundPayments: [], heldUnpaid: true, ...none });
  });

  it("a purchase order without a clear answer: ask BigBuy now (never order again); delivered can be marked once all are placed", () => {
    const so = (id: string, status: string) => ({ id, status }) as unknown as AdminOrder["purchases"][number];
    const o = order({ status: "FULFILLMENT_PENDING", purchases: [so("s1", "UNKNOWN")] });
    expect(adminOptions(o).lookupPurchase).toEqual({ supplierOrderId: "s1" });
    expect(adminOptions(o).markDelivered).toBe(false);
    const placed = order({ status: "PURCHASED", purchases: [so("s1", "PLACED")] });
    expect(adminOptions(placed)).toMatchObject({ lookupPurchase: null, markDelivered: true });
  });

  it("an unpaid order without a hold is not cancelled by hand: the expiry does that", () => {
    const o = order({ status: "PENDING_PAYMENT", payments: [pay("p1", "PENDING", 2445)] });
    expect(adminOptions(o).cancel).toBeNull();
  });
});
