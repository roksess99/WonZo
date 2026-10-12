// The new routes refuse what they must refuse, before anything is touched
// (.claude/rules/beveiliging.md § Autorisatie; docs/TESTEN.md). The
// "allowed" case of each runs against the test database
// (tests/integration/). No database or payment key here, and checkout is off
// — as on the live site until launch.

import { afterEach, describe, expect, it } from "vitest";
import { POST as checkout } from "@/app/api/checkout/route";
import { POST as cronOrders } from "@/app/api/cron/orders/route";
import { POST as orders } from "@/app/api/orders/route";
import { POST as webhook } from "@/app/api/payments/webhook/route";
import { checkoutEnabled } from "@/lib/checkout";
import { fromOwnSite, visitorKey } from "@/lib/http";

const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3000${path}`, { method: "POST", body, headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers } });

describe("POST /api/checkout", () => {
  it("is off until launch: nothing is placed", async () => {
    const res = await checkout(post("/api/checkout", "{}"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ kind: "off" });
  });

  it("reads CHECKOUT_ENABLED strictly", () => {
    expect(checkoutEnabled({})).toBe(false);
    expect(checkoutEnabled({ CHECKOUT_ENABLED: "false" })).toBe(false);
    expect(checkoutEnabled({ CHECKOUT_ENABLED: "true" })).toBe(true);
    expect(() => checkoutEnabled({ CHECKOUT_ENABLED: "yes" })).toThrow(/must be "true" or "false"/);
  });
});

describe("POST /api/orders", () => {
  it("opens nothing without a database, whatever the key", async () => {
    const res = await orders(post("/api/orders", JSON.stringify({ token: "x".repeat(43), action: "cancel" })));
    expect(res.status).toBe(404);
  });
});

describe("CSRF and rate-limit keys", () => {
  const site = new URL("https://wonzo.nl");
  it("accepts only our own Origin, and refuses a missing one", () => {
    const req = (origin?: string) => new Request("https://wonzo.nl/api/checkout", { method: "POST", headers: origin ? { origin } : {} });
    expect(fromOwnSite(req("https://wonzo.nl"), site)).toBe(true);
    expect(fromOwnSite(req("https://evil.example"), site)).toBe(false);
    expect(fromOwnSite(req("https://wonzo.nl.evil.example"), site)).toBe(false);
    expect(fromOwnSite(req(), site)).toBe(false);
  });

  it("keys a visitor by a hash, never the address itself", () => {
    const key = visitorKey(new Request("https://wonzo.nl", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } }));
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(key).not.toContain("203");
    expect(visitorKey(new Request("https://wonzo.nl", { headers: { "x-forwarded-for": "203.0.113.8" } }))).not.toBe(key);
  });
});

describe("POST /api/payments/webhook", () => {
  it("answers 200 and does nothing without a provider", async () => {
    const res = await webhook(new Request("http://localhost:3000/api/payments/webhook", { method: "POST", body: "id=tr_abcdef", headers: { "content-type": "application/x-www-form-urlencoded" } }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/cron/orders", () => {
  afterEach(() => {
    delete process.env.JOB_TOKEN;
  });
  const call = (token?: string) => cronOrders(new Request("http://localhost/api/cron/orders", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} }));

  it("does not exist without JOB_TOKEN", async () => {
    expect((await call("x".repeat(40))).status).toBe(404);
  });

  it("refuses a missing or wrong token", async () => {
    process.env.JOB_TOKEN = "a".repeat(64);
    expect((await call()).status).toBe(401);
    expect((await call("b".repeat(64))).status).toBe(401);
  });

  it("with the right token and no database: says so, instead of failing", async () => {
    process.env.JOB_TOKEN = "a".repeat(64);
    const res = await call("a".repeat(64));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "not-configured" });
  });
});
