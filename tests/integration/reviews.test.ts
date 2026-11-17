// Reviews against the test database (D-12, owner 2026-10-15): invited 7 days
// after the delivery, once; only with the key from the invitation; each
// subject once; published at once; hidden only with a reason; opting out holds.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, selectRows, toDbTime, withTransaction } from "@/lib/db";
import { placeOrder } from "@/lib/orders";
import {
  adminReviews,
  issueReviewToken,
  optOutOfInvites,
  publicReviews,
  replyToReview,
  reviewForm,
  runReviewInvites,
  setReviewVisibility,
  submitReviews,
} from "@/lib/reviews";

afterAll(async () => {
  await getPool().end();
});

// Other files leave delivered orders behind; invite them once now, so this file's own orders are not crowded out.
beforeAll(async () => {
  for (let i = 0; i < 20; i++) if ((await runReviewInvites(new Date(), 500)) === 0) break;
}, 300_000);

const DAY = 86_400_000;

/** An order delivered `daysAgo` days ago, with two different products. */
async function delivered(daysAgo: number) {
  const email = `review-${randomUUID().slice(0, 8)}@example.nl`;
  const customer = { email, phone: "0612345678", firstName: "Test", lastName: "Review", street: "Teststraat", houseNumber: "1", postcode: "1234 AB", city: "Arnhem" };
  const r = await placeOrder({ checkoutAttemptId: randomUUID(), locale: "nl", lines: [{ source: "bigbuy", productId: "1300118", quantity: 1 }, { source: "bigbuy", productId: "1300104", quantity: 1 }], customer }, new Date());
  if (r.kind !== "placed") throw new Error(r.kind);
  await getPool().query("UPDATE orders SET status = 'DELIVERED', delivered_at = ? WHERE id = ?", [toDbTime(new Date(Date.now() - daysAgo * DAY)), r.orderId]);
  const token = await withTransaction((conn) => issueReviewToken(conn, r.orderId, new Date()));
  const form = (await reviewForm(getPool(), r.orderId))!;
  return { orderId: r.orderId, reference: r.reference, email, token, keys: form.products.map((p) => p.key) };
}
const invited = async (orderId: number) => (await selectRows<{ n: number | string }>(getPool(), "SELECT COUNT(*) AS n FROM outbox WHERE kind = 'review-invite' AND dedupe_key = ?", [`order:${orderId}`]))[0]!.n;

describe("the invitation", () => {
  it("7 days after the delivery, once; not after 3 days; not for an address that opted out", async () => {
    const early = await delivered(3);
    const due = await delivered(8);
    const away = await delivered(8);
    expect(await optOutOfInvites(away.token)).toBe(true);
    await runReviewInvites(new Date(), 500);
    await runReviewInvites(new Date(), 500);
    expect(Number(await invited(due.orderId))).toBe(1);
    expect(Number(await invited(early.orderId))).toBe(0);
    expect(Number(await invited(away.orderId))).toBe(0);
  });
});

describe("reviewing with the key from the invitation", () => {
  it("the shop and a product, published at once; each once — a second try changes nothing", async () => {
    const o = await delivered(8);
    const r = await submitReviews({ token: o.token, shop: { rating: 4, body: "Netjes geleverd" }, products: { [o.keys[0]!]: { rating: 2, body: "Kleiner dan gedacht" } }, displayName: "Sanne" });
    expect(r).toEqual({ kind: "done", count: 2 });
    expect(await submitReviews({ token: o.token, shop: { rating: 1 } })).toEqual({ kind: "already" });
    const form = (await reviewForm(getPool(), o.orderId))!;
    expect(form.shopReviewed).toBe(true);
    expect(form.products.map((p) => p.reviewed)).toEqual([true, false]);
    const [source, productId] = o.keys[0]!.split(":") as [string, string];
    const listed = await publicReviews(getPool(), { subject: "product", source, productId }, 500);
    expect(listed.reviews.some((x) => x.body === "Kleiner dan gedacht" && x.rating === 2 && x.name === "Sanne")).toBe(true);
  });

  it("refused: an unknown key, an order not delivered, a product this order did not buy", async () => {
    expect(await submitReviews({ token: "x".repeat(43), shop: { rating: 5 } })).toEqual({ kind: "not-found" });
    const o = await delivered(8);
    expect(await submitReviews({ token: o.token, products: { "bigbuy:999999": { rating: 5 } } })).toMatchObject({ kind: "invalid", key: "bigbuy:999999" });
    await getPool().query("UPDATE orders SET status = 'SHIPPED' WHERE id = ?", [o.orderId]);
    expect(await submitReviews({ token: o.token, shop: { rating: 5 } })).toEqual({ kind: "not-yet" });
  });
});

describe("the panel: answer, and hide only with a reason", () => {
  it("a low score is on the list until answered; hidden it leaves the site, shown again it is back — each in the audit log", async () => {
    const o = await delivered(8);
    await submitReviews({ token: o.token, shop: { rating: 1, body: "Te laat" } });
    const mine = async (filter: "all" | "low" | "hidden") => (await adminReviews(getPool(), filter, 1000)).find((x) => x.orderId === o.orderId);
    const review = (await mine("low"))!;
    expect(review).toMatchObject({ rating: 1, orderReference: o.reference, subject: "shop" });
    expect(JSON.stringify(review)).not.toContain(o.email);

    expect(await replyToReview({ reviewId: review.id, reply: "Sorry, we zoeken het uit.", actor: "admin:test" })).toEqual({ ok: true });
    expect(await mine("low")).toBeUndefined();

    expect(await setReviewVisibility({ reviewId: review.id, hide: true, reason: " ", actor: "admin:test" })).toEqual({ ok: false, error: "reason-required" });
    expect(await setReviewVisibility({ reviewId: review.id, hide: true, reason: "bevat een telefoonnummer", actor: "admin:test" })).toEqual({ ok: true });
    expect(await setReviewVisibility({ reviewId: review.id, hide: true, reason: "nog eens", actor: "admin:test" })).toEqual({ ok: false, error: "changed" });
    const shop = await publicReviews(getPool(), { subject: "shop" }, 1000);
    expect(shop.reviews.some((x) => x.id === review.id)).toBe(false);
    expect((await mine("hidden"))?.hiddenReason).toBe("bevat een telefoonnummer");
    expect(await setReviewVisibility({ reviewId: review.id, hide: false, reason: "nummer was van de winkel", actor: "admin:test" })).toEqual({ ok: true });
    expect((await publicReviews(getPool(), { subject: "shop" }, 1000)).reviews.some((x) => x.id === review.id)).toBe(true);

    const actions = (await selectRows<{ action: string }>(getPool(), "SELECT action FROM audit_log WHERE object_type = 'order' AND object_id = ? ORDER BY id", [String(o.orderId)])).map((a) => a.action);
    expect(actions).toEqual(["review.created", "review.replied", "review.hidden", "review.shown"]);
  });
});
