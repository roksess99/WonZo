// Reviews without a database (D-12, owner 2026-10-15): what the form may
// send, how the average is shown, and who may act on reviews.

import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }), cookies: async () => ({ get: () => undefined }) }));

import { hideAction, replyAction, showAction } from "@/app/beheer/beoordelingen/actions";
import { GET as reviewsGet, POST as reviewsPost } from "@/app/api/reviews/route";
import { averageDown, emailHash, parseSubmission } from "@/lib/reviews";

describe("what the review form may send", () => {
  it("the shop and products, 1–5 stars each, a text and a name that may stay empty", () => {
    expect(parseSubmission({ shop: { rating: 5, body: "  Snel!  " }, products: { "bigbuy:1300106": { rating: 2, body: "" } }, displayName: " Sanne " })).toEqual({
      ok: true,
      value: { shop: { rating: 5, body: "Snel!" }, products: [{ key: "bigbuy:1300106", rating: 2, body: null }], displayName: "Sanne" },
    });
  });
  it("out of range is refused, never adjusted: 0 or 6 stars, half a star, a text over 2000, markup in the name, nothing at all", () => {
    expect(parseSubmission({ shop: { rating: 6 } })).toMatchObject({ ok: false, error: "rating" });
    expect(parseSubmission({ shop: { rating: 0 } })).toMatchObject({ ok: false, error: "rating" });
    expect(parseSubmission({ shop: { rating: 4.5 } })).toMatchObject({ ok: false, error: "rating" });
    expect(parseSubmission({ shop: { rating: 4, body: "x".repeat(2001) } })).toMatchObject({ ok: false, error: "body" });
    expect(parseSubmission({ shop: { rating: 4 }, displayName: "<b>Sanne</b>" })).toMatchObject({ ok: false, error: "name" });
    expect(parseSubmission({ products: { "not a key": { rating: 4 } } })).toMatchObject({ ok: false, error: "rating" });
    expect(parseSubmission({})).toEqual({ ok: false, error: "empty" });
  });
  it("names with accents and hyphens are fine", () => {
    expect(parseSubmission({ shop: { rating: 3 }, displayName: "Zoë Çelik-de Vries" })).toMatchObject({ ok: true, value: { displayName: "Zoë Çelik-de Vries" } });
  });
});

describe("the average and the opt-out key", () => {
  it("one decimal, rounded down: 5 + 4 + 4 = 13 / 3 = 4,33 → 4,3; 9 / 2 = 4,5", () => {
    expect(averageDown(13, 3)).toBe(4.3);
    expect(averageDown(9, 2)).toBe(4.5);
    expect(averageDown(0, 0)).toBeNull();
  });
  it("the same address in any case gives the same key, and the key is not the address", () => {
    expect(emailHash(" Klant@Example.NL ")).toBe(emailHash("klant@example.nl"));
    expect(emailHash("klant@example.nl")).not.toContain("klant");
  });
});

describe("who may do what (there is no database here)", () => {
  it("the panel's actions refuse without an admin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const form = new FormData();
    form.set("reviewId", "1");
    form.set("reason", "test");
    form.set("reply", "Dank je");
    for (const act of [replyAction, hideAction, showAction]) expect(await act({ ok: null }, form)).toEqual({ ok: false, error: "access" });
    vi.unstubAllEnvs();
  });
  it("the public list asks for a well-formed product; posting needs a database", async () => {
    expect((await reviewsGet(new Request("http://localhost:3000/api/reviews?source=bigbuy&product=13%2006"))).status).toBe(400);
    const ok = await reviewsGet(new Request("http://localhost:3000/api/reviews?source=bigbuy&product=1300106"));
    expect(await ok.json()).toEqual({ summary: { count: 0, average: null, perStar: [0, 0, 0, 0, 0] }, reviews: [] });
    const res = await reviewsPost(new Request("http://localhost:3000/api/reviews", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: "{}" }));
    expect(res.status).toBe(404);
  });
});
