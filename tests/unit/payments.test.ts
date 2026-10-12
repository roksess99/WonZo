import { describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { pathTo } from "@/lib/payments";
import { mollieProvider, parseMollieConfig, parsePayment, ProviderOutcomeUnknown, ProviderRefused, toMollieAmount } from "@/lib/payments/mollie";
import { canTransitionPayment, canTransitionRefund, fromMolliePaymentStatus, fromMollieRefundStatus } from "@/lib/payments/states";

describe("payment and refund state machines (docs/STATE_MACHINES.md)", () => {
  it("refuses the forbidden payment transitions", () => {
    for (const actor of ["customer", "system", "provider", "reconciliation"] as const) {
      expect(canTransitionPayment("PAID", "FAILED", actor)).toBe(false);
      expect(canTransitionPayment("FAILED", "PAID", actor)).toBe(false);
      expect(canTransitionPayment("EXPIRED", "PAID", actor)).toBe(false);
    }
    // Only the provider or reconciliation can say a payment is paid.
    expect(canTransitionPayment("PENDING", "PAID", "customer")).toBe(false);
    expect(canTransitionPayment("PENDING", "PAID", "system")).toBe(false);
  });

  it("never lets a refund succeed without the provider", () => {
    expect(canTransitionRefund("REQUESTED", "SUCCEEDED", "system")).toBe(false);
    expect(canTransitionRefund("SUBMITTED", "SUCCEEDED", "system")).toBe(false);
    expect(canTransitionRefund("SUBMITTED", "SUCCEEDED", "provider")).toBe(true);
  });

  it("finds the way through PENDING when the provider is first to tell", () => {
    expect(pathTo("CREATED", "PAID", "provider")).toEqual(["PAID"]);
    expect(pathTo("UNKNOWN", "EXPIRED", "provider")).toEqual(["PENDING", "EXPIRED"]);
    expect(pathTo("PENDING", "CHARGED_BACK", "provider")).toEqual(["PAID", "CHARGED_BACK"]);
    expect(pathTo("EXPIRED", "PAID", "provider")).toBeNull();
  });

  it("maps Mollie's words onto ours (D-05)", () => {
    expect(["open", "pending", "authorized", "paid", "canceled", "expired", "failed", "weird"].map(fromMolliePaymentStatus)).toEqual([
      "PENDING", "PENDING", "AUTHORIZED", "PAID", "CANCELED", "EXPIRED", "FAILED", null,
    ]);
    expect(["queued", "pending", "processing", "refunded", "failed", "canceled"].map(fromMollieRefundStatus)).toEqual([null, null, null, "SUCCEEDED", "FAILED", "FAILED"]);
  });
});

describe("Mollie at the edge", () => {
  it("writes amounts as exact strings with two decimals", () => {
    expect(toMollieAmount(money(2445))).toEqual({ currency: "EUR", value: "24.45" });
    expect(toMollieAmount(money(5))).toEqual({ currency: "EUR", value: "0.05" });
    expect(toMollieAmount(money(100000))).toEqual({ currency: "EUR", value: "1000.00" });
    expect(() => toMollieAmount(money(-1))).toThrow();
  });

  const payment = {
    id: "tr_WDqYK6vllg",
    status: "open",
    amount: { currency: "EUR", value: "24.45" },
    metadata: { orderId: 7, paymentId: "p-1" },
    _links: { checkout: { href: "https://www.mollie.com/checkout/select-method/WDqYK6vllg" } },
  };

  it("reads a payment, and only trusts a payment page of Mollie itself", () => {
    expect(parsePayment(payment)).toMatchObject({ id: "tr_WDqYK6vllg", amount: money(2445), checkoutUrl: payment._links.checkout.href, metadata: { orderId: 7, paymentId: "p-1" } });
    for (const href of ["https://evil.example/checkout", "http://www.mollie.com/checkout", "https://www.mollie.com.evil.example/x"]) {
      expect(parsePayment({ ...payment, _links: { checkout: { href } } })!.checkoutUrl).toBeNull();
    }
    expect(parsePayment({ ...payment, id: "x" })).toBeNull();
    expect(parsePayment({ ...payment, amount: { currency: "USD", value: "1.00" } })).toBeNull();
  });

  it("accepts a test key, refuses a live key outside production and anything that is not a key", () => {
    expect(parseMollieConfig({})).toBeNull();
    expect(parseMollieConfig({ MOLLIE_API_KEY: "test_" + "a".repeat(30) })).toEqual({ apiKey: "test_" + "a".repeat(30), testMode: true });
    expect(() => parseMollieConfig({ MOLLIE_API_KEY: "live_" + "a".repeat(30), NODE_ENV: "development" })).toThrow(/refused outside production/);
    expect(parseMollieConfig({ MOLLIE_API_KEY: "live_" + "a".repeat(30), NODE_ENV: "production" })?.testMode).toBe(false);
    expect(() => parseMollieConfig({ MOLLIE_API_KEY: "sk_live_abc" })).toThrow(/not a Mollie API key/);
  });

  const config = { apiKey: "test_" + "a".repeat(30), testMode: true };
  const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("sends our id as the idempotency key, the amount from the order, and only our methods", async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return reply(201, payment)();
    }) as unknown as typeof fetch;
    const p = await mollieProvider(config, fake).createPayment({
      key: "p-1", amount: money(2445), description: "WonZo WZ-2026-00001", redirectUrl: "https://wonzo.nl/bestelling/t",
      webhookUrl: null, locale: "nl", metadata: { orderId: 7, paymentId: "p-1" },
    });
    expect(p.id).toBe("tr_WDqYK6vllg");
    const s = sent as unknown as { url: string; init: RequestInit };
    expect(s.url).toBe("https://api.mollie.com/v2/payments");
    expect((s.init.headers as Record<string, string>)["Idempotency-Key"]).toBe("p-1");
    const body = JSON.parse(String(s.init.body));
    expect(body).toMatchObject({ amount: { currency: "EUR", value: "24.45" }, method: ["ideal", "applepay", "creditcard"], locale: "nl_NL", metadata: { orderId: 7, paymentId: "p-1" } });
    expect(body).not.toHaveProperty("webhookUrl"); // localhost: the provider cannot reach it
  });

  it("tells 'not known' (404), 'no outcome' (timeout, 5xx, 409) and 'refused' (4xx) apart", async () => {
    expect(await mollieProvider(config, reply(404, {}) as unknown as typeof fetch).getPayment("tr_WDqYK6vllg")).toBeNull();
    const create = (f: unknown) =>
      mollieProvider(config, f as typeof fetch).createPayment({ key: "k", amount: money(1), description: "d", redirectUrl: "https://wonzo.nl", webhookUrl: null, locale: "en", metadata: { orderId: 1, paymentId: "k" } });
    await expect(create(reply(500, {}))).rejects.toBeInstanceOf(ProviderOutcomeUnknown);
    await expect(create(reply(409, {}))).rejects.toBeInstanceOf(ProviderOutcomeUnknown);
    await expect(create(async () => { throw new TypeError("network"); })).rejects.toBeInstanceOf(ProviderOutcomeUnknown);
    await expect(create(reply(422, { detail: "The amount is lower than the minimum" }))).rejects.toBeInstanceOf(ProviderRefused);
  });

  it("refuses an id that is not Mollie's before any call", async () => {
    await expect(mollieProvider(config, reply(200, {}) as unknown as typeof fetch).getPayment("../../v2/refunds")).rejects.toThrow(/Not a provider id/);
  });
});
