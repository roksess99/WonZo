// Reviews (D-12, owner 2026-10-15): our own system. Only a buyer can review,
// through a link that belongs to one order (a key, stored as a hash); the
// shop and each product bought, once each (a unique key). A review is
// published at once — hiding needs a reason, which goes into the audit log,
// because publishing selectively is an unfair commercial practice
// (`WETTELIJK`, to be confirmed). An invitation goes out 7 days after the
// delivery, once per order, with a way to opt out (stored as a hash of the
// address). Server-side only.

import { createHash, randomBytes } from "node:crypto";
import { appendAudit } from "@/lib/admin/audit";
import { cleanReason } from "@/lib/admin/order-actions";
import { fromDbTime, getPool, isDuplicateKey, selectRows, toDbTime, withTransaction, type Connection, type Queryable } from "@/lib/db";
import type { Locale } from "@/lib/i18n/config";
import { enqueue } from "@/lib/orders/outbox";

/** Owner 2026-10-15: the invitation 7 days after the delivery. */
export const REVIEW_INVITE_DAYS = 7;
/** An order delivered longer ago than this gets no invitation any more: nobody remembers it, and it would read as spam. */
export const REVIEW_INVITE_MAX_DAYS = 60;
const DAY_MS = 86_400_000;
/** The order statuses in which the customer has the goods. */
const REVIEWABLE = ["DELIVERED", "COMPLETED"];

export type ReviewSubject = "shop" | "product";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
/** The opt-out key of an address: its hash, so the list holds no addresses (docs/PRIVACY.md). */
export const emailHash = (email: string) => hash(`wonzo-review-optout:${email.trim().toLowerCase()}`);

// ------------------------------------------------------------- the form (pure)

export type ReviewEntry = { rating: number; body: string | null };
export type ReviewSubmission = { shop: ReviewEntry | null; products: (ReviewEntry & { key: string })[]; displayName: string | null };
export type SubmissionError = "empty" | "rating" | "body" | "name";

const text = (x: unknown, max: number): string | null | false => {
  if (x === undefined || x === null || x === "") return null;
  if (typeof x !== "string") return false;
  const t = x.trim().replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  if (!t) return null;
  return t.length <= max ? t : false;
};

/** "bigbuy:1300106": the product as the order line knows it. */
export const productKey = (source: string, productId: string) => `${source}:${productId}`;

/**
 * What the browser sent: per subject a rating of 1–5 and an optional text,
 * and an optional name. Out of range is refused, never adjusted. Pure.
 */
export function parseSubmission(x: unknown): { ok: true; value: ReviewSubmission } | { ok: false; error: SubmissionError; key?: string } {
  const o = typeof x === "object" && x !== null ? (x as Record<string, unknown>) : {};
  const entry = (e: unknown, key?: string): ReviewEntry | null | { error: SubmissionError; key?: string } => {
    if (e === undefined || e === null) return null;
    const r = e as Record<string, unknown>;
    if (!Number.isInteger(r.rating) || (r.rating as number) < 1 || (r.rating as number) > 5) return { error: "rating", key };
    const body = text(r.body, 2000);
    if (body === false) return { error: "body", key };
    return { rating: r.rating as number, body };
  };
  const shop = entry(o.shop, "shop");
  if (shop && "error" in shop) return { ok: false, error: shop.error, key: shop.key };
  const products: (ReviewEntry & { key: string })[] = [];
  if (o.products !== undefined && (typeof o.products !== "object" || o.products === null || Array.isArray(o.products))) return { ok: false, error: "rating" };
  for (const [key, e] of Object.entries((o.products as Record<string, unknown> | undefined) ?? {})) {
    if (!/^[a-z]{1,20}:[A-Za-z0-9_-]{1,20}$/.test(key) || products.length >= 50) return { ok: false, error: "rating", key };
    const p = entry(e, key);
    if (p && "error" in p) return { ok: false, error: p.error, key };
    if (p) products.push({ ...p, key });
  }
  const name = text(o.displayName, 60);
  if (name === false || (name !== null && !/^[\p{L}\p{M}\p{N} .'\-]+$/u.test(name))) return { ok: false, error: "name" };
  if (!shop && !products.length) return { ok: false, error: "empty" };
  return { ok: true, value: { shop: shop as ReviewEntry | null, products, displayName: name } };
}

/** The average to one decimal, rounded down: a shown score is never more than it is (.claude/rules/geld.md § Rekenen, the same rule as for a percentage). */
export function averageDown(sum: number, count: number): number | null {
  if (!count) return null;
  return Math.floor((sum * 10) / count) / 10;
}

// ------------------------------------------------------------- the link

/** A new key for the review link. Only its hash is stored; every mail gets its own. */
export async function issueReviewToken(conn: Connection, orderId: number, now: Date): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await conn.query("INSERT INTO review_tokens (token_hash, order_id, created_at) VALUES (?, ?, ?)", [hash(token), orderId, toDbTime(now)]);
  return token;
}

export async function orderByReviewToken(db: Queryable, token: string): Promise<number | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await selectRows<{ order_id: number | string }>(db, "SELECT order_id FROM review_tokens WHERE token_hash = ?", [hash(token)]);
  return row ? Number(row.order_id) : null;
}

export type ReviewForm = {
  reference: string;
  locale: Locale;
  /** The products bought, once each, with the name the customer saw. */
  products: { key: string; name: string; reviewed: boolean }[];
  shopReviewed: boolean;
  /** Not delivered (yet): the form says so instead of asking. */
  reviewable: boolean;
};

export async function reviewForm(db: Queryable, orderId: number): Promise<ReviewForm | null> {
  const [o] = await selectRows<{ reference: string; locale: string; status: string }>(db, "SELECT reference, locale, status FROM orders WHERE id = ?", [orderId]);
  if (!o) return null;
  const lines = await selectRows<{ source: string; product_id: string; name: string }>(db, "SELECT source, product_id, name FROM order_lines WHERE order_id = ? ORDER BY line_no", [orderId]);
  const done = await selectRows<{ subject: string; source: string; product_id: string }>(db, "SELECT subject, source, product_id FROM reviews WHERE order_id = ?", [orderId]);
  const reviewed = new Set(done.filter((d) => d.subject === "product").map((d) => productKey(d.source, d.product_id)));
  const seen = new Set<string>();
  const products = lines.flatMap((l) => {
    const key = productKey(l.source, l.product_id);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ key, name: l.name, reviewed: reviewed.has(key) }];
  });
  return { reference: o.reference, locale: o.locale === "en" ? "en" : "nl", products, shopReviewed: done.some((d) => d.subject === "shop"), reviewable: REVIEWABLE.includes(o.status) };
}

export type SubmitResult = { kind: "done"; count: number } | { kind: "not-found" } | { kind: "not-yet" } | { kind: "already" } | { kind: "invalid"; error: SubmissionError; key?: string };

/** The customer sends the form. Each subject once; what was reviewed before is left as it is. */
export async function submitReviews(input: { token?: unknown } & Record<string, unknown>, now: Date = new Date()): Promise<SubmitResult> {
  const orderId = typeof input.token === "string" ? await orderByReviewToken(getPool(), input.token) : null;
  if (!orderId) return { kind: "not-found" };
  const parsed = parseSubmission(input);
  if (!parsed.ok) return { kind: "invalid", error: parsed.error, key: parsed.key };
  return withTransaction(async (conn): Promise<SubmitResult> => {
    const form = await reviewForm(conn, orderId);
    if (!form) return { kind: "not-found" };
    if (!form.reviewable) return { kind: "not-yet" };
    const bought = new Set(form.products.map((p) => p.key));
    // Only what this order bought: a key from elsewhere is refused, not ignored.
    const foreign = parsed.value.products.find((p) => !bought.has(p.key));
    if (foreign) return { kind: "invalid", error: "rating", key: foreign.key };
    const v = parsed.value;
    const rows = [
      ...(v.shop ? [{ subject: "shop" as const, source: "", productId: "", entry: v.shop }] : []),
      ...v.products.map((p) => {
        const [source = "", productId = ""] = p.key.split(":");
        return { subject: "product" as const, source, productId, entry: p };
      }),
    ];
    let count = 0;
    for (const r of rows) {
      try {
        await conn.query(
          `INSERT INTO reviews (order_id, subject, source, product_id, rating, body, display_name, locale, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', ?)`,
          [orderId, r.subject, r.source, r.productId, r.entry.rating, r.entry.body, v.displayName, form.locale, toDbTime(now)],
        );
        count++;
      } catch (err) {
        // Reviewed before (another tab, or the link used twice): that one stays as it was.
        if (!isDuplicateKey(err)) throw err;
      }
    }
    if (!count) return { kind: "already" };
    await appendAudit(conn, { actor: "customer", action: "review.created", objectType: "order", objectId: orderId, after: { reviews: count } }, now);
    return { kind: "done", count };
  });
}

/** No more invitations to this address. The key of the link proves it is the customer's own. */
export async function optOutOfInvites(token: unknown, now: Date = new Date()): Promise<boolean> {
  const orderId = typeof token === "string" ? await orderByReviewToken(getPool(), token) : null;
  if (!orderId) return false;
  const [o] = await selectRows<{ email: string }>(getPool(), "SELECT email FROM orders WHERE id = ?", [orderId]);
  if (!o) return false;
  await getPool().query("INSERT INTO review_optouts (email_hash, created_at) VALUES (?, ?) ON DUPLICATE KEY UPDATE email_hash = email_hash", [emailHash(o.email), toDbTime(now)]);
  return true;
}

export async function optedOut(db: Queryable, email: string): Promise<boolean> {
  const [row] = await selectRows<{ x: number }>(db, "SELECT 1 AS x FROM review_optouts WHERE email_hash = ?", [emailHash(email)]);
  return Boolean(row);
}

// ------------------------------------------------------------- showing them

export type PublicReview = { id: number; rating: number; body: string | null; name: string | null; reply: string | null; createdAt: Date; locale: Locale };
export type ReviewSummary = { count: number; average: number | null; perStar: number[] };

type Where = { sql: string; params: unknown[] };
const whereOf = (s: { subject: "shop" } | { subject: "product"; source: string; productId: string }): Where =>
  s.subject === "shop" ? { sql: "subject = 'shop'", params: [] } : { sql: "subject = 'product' AND source = ? AND product_id = ?", params: [s.source, s.productId] };

/** Published reviews, newest first — all of them, low scores too (D-12). */
export async function publicReviews(db: Queryable, s: Parameters<typeof whereOf>[0], limit = 50): Promise<{ summary: ReviewSummary; reviews: PublicReview[] }> {
  const w = whereOf(s);
  const stars = await selectRows<{ rating: number | string; n: number | string }>(db, `SELECT rating, COUNT(*) AS n FROM reviews WHERE ${w.sql} AND status = 'PUBLISHED' GROUP BY rating`, w.params);
  const perStar = [1, 2, 3, 4, 5].map((r) => Number(stars.find((x) => Number(x.rating) === r)?.n ?? 0));
  const count = perStar.reduce((a, b) => a + b, 0);
  const sum = perStar.reduce((a, n, i) => a + n * (i + 1), 0);
  const rows = await selectRows<Record<string, unknown>>(
    db,
    `SELECT id, rating, body, display_name, reply, created_at, locale FROM reviews WHERE ${w.sql} AND status = 'PUBLISHED' ORDER BY created_at DESC, id DESC LIMIT ?`,
    [...w.params, limit],
  );
  return {
    summary: { count, average: averageDown(sum, count), perStar },
    reviews: rows.map((r) => ({
      id: Number(r.id), rating: Number(r.rating), body: r.body === null ? null : String(r.body), name: r.display_name === null ? null : String(r.display_name),
      reply: r.reply === null ? null : String(r.reply), createdAt: fromDbTime(String(r.created_at)), locale: r.locale === "en" ? "en" : "nl",
    })),
  };
}

// ------------------------------------------------------------- invitations

/**
 * Orders delivered at least 7 days ago (and at most 60), without an
 * invitation yet: one "review-invite" in the outbox each (its key makes it
 * once). Not for an order with a return that was not refused, and not for an
 * address that opted out. The mail itself checks the opt-out again.
 */
export async function runReviewInvites(now: Date = new Date(), limit = 100): Promise<number> {
  const due = await selectRows<{ id: number | string; email: string }>(
    getPool(),
    `SELECT o.id, o.email FROM orders o
      WHERE o.status IN ('DELIVERED', 'COMPLETED') AND o.delivered_at <= ? AND o.delivered_at >= ?
        AND NOT EXISTS (SELECT 1 FROM outbox x WHERE x.kind = 'review-invite' AND x.dedupe_key = CONCAT('order:', o.id))
        AND NOT EXISTS (SELECT 1 FROM returns r WHERE r.order_id = o.id AND r.status NOT IN ('REJECTED', 'WITHDRAWN'))
      ORDER BY o.delivered_at LIMIT ?`,
    [toDbTime(new Date(now.getTime() - REVIEW_INVITE_DAYS * DAY_MS)), toDbTime(new Date(now.getTime() - REVIEW_INVITE_MAX_DAYS * DAY_MS)), limit],
  );
  let n = 0;
  for (const o of due) {
    if (await optedOut(getPool(), o.email)) continue;
    await withTransaction((conn) => enqueue(conn, "review-invite", `order:${Number(o.id)}`, { orderId: Number(o.id) }, now));
    n++;
  }
  return n;
}

// ------------------------------------------------------------- the panel

export type AdminReview = PublicReview & {
  subject: ReviewSubject;
  status: "PUBLISHED" | "HIDDEN";
  hiddenReason: string | null;
  orderId: number;
  orderReference: string;
  /** The product's name as it was bought; null for the shop. */
  productName: string | null;
};

/**
 * For the panel (right "beoordelingen", also marketing): the order number,
 * never the customer's name or address (the description of 2026-10-12, §7).
 */
export async function adminReviews(db: Queryable, filter: "all" | "low" | "hidden", limit = 100): Promise<AdminReview[]> {
  const where = filter === "hidden" ? "r.status = 'HIDDEN'" : filter === "low" ? "r.status = 'PUBLISHED' AND r.rating <= 2 AND r.reply IS NULL" : "1 = 1";
  const rows = await selectRows<Record<string, unknown>>(
    db,
    `SELECT r.id, r.subject, r.rating, r.body, r.display_name, r.reply, r.created_at, r.locale, r.status, r.hidden_reason, r.order_id, o.reference,
            (SELECT l.name FROM order_lines l WHERE l.order_id = r.order_id AND l.source = r.source AND l.product_id = r.product_id ORDER BY l.line_no LIMIT 1) AS product_name
       FROM reviews r JOIN orders o ON o.id = r.order_id
      WHERE ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    id: Number(r.id), rating: Number(r.rating), body: r.body === null ? null : String(r.body), name: r.display_name === null ? null : String(r.display_name),
    reply: r.reply === null ? null : String(r.reply), createdAt: fromDbTime(String(r.created_at)), locale: r.locale === "en" ? "en" : "nl",
    subject: r.subject === "shop" ? "shop" : "product", status: r.status === "HIDDEN" ? "HIDDEN" : "PUBLISHED", hiddenReason: r.hidden_reason === null ? null : String(r.hidden_reason),
    orderId: Number(r.order_id), orderReference: String(r.reference), productName: r.product_name === null || r.product_name === undefined ? null : String(r.product_name),
  }));
}

/** Low scores without an answer yet: on the dashboard (docs/BEHEER.md § Dashboard: a low score should be answered). */
export async function lowReviewsWithoutReply(db: Queryable): Promise<number> {
  const [row] = await selectRows<{ n: number | string }>(db, "SELECT COUNT(*) AS n FROM reviews WHERE status = 'PUBLISHED' AND rating <= 2 AND reply IS NULL");
  return Number(row?.n ?? 0);
}

/** Orders that will get an invitation, with the day it goes out (the description of 2026-10-12, §7). */
export async function upcomingInvites(db: Queryable, now: Date = new Date(), limit = 50): Promise<{ orderId: number; reference: string; dueAt: Date }[]> {
  const rows = await selectRows<{ id: number | string; reference: string; delivered_at: string }>(
    db,
    `SELECT o.id, o.reference, o.delivered_at FROM orders o
      WHERE o.status IN ('DELIVERED', 'COMPLETED') AND o.delivered_at >= ?
        AND NOT EXISTS (SELECT 1 FROM outbox x WHERE x.kind = 'review-invite' AND x.dedupe_key = CONCAT('order:', o.id))
        AND NOT EXISTS (SELECT 1 FROM returns r WHERE r.order_id = o.id AND r.status NOT IN ('REJECTED', 'WITHDRAWN'))
      ORDER BY o.delivered_at LIMIT ?`,
    [toDbTime(new Date(now.getTime() - REVIEW_INVITE_MAX_DAYS * DAY_MS)), limit],
  );
  return rows.map((r) => ({ orderId: Number(r.id), reference: r.reference, dueAt: new Date(fromDbTime(r.delivered_at).getTime() + REVIEW_INVITE_DAYS * DAY_MS) }));
}

export type ReviewActionResult = { ok: true } | { ok: false; error: "not-found" | "reason-required" | "reply-required" | "changed" };

/** The shop's answer, shown under the review; replaced when written again. Empty removes it. */
export async function replyToReview(input: { reviewId: number; reply: unknown; actor: string; now?: Date }): Promise<ReviewActionResult> {
  const now = input.now ?? new Date();
  const reply = text(input.reply, 2000);
  if (reply === false) return { ok: false, error: "reply-required" };
  return withTransaction(async (conn): Promise<ReviewActionResult> => {
    const [r] = await selectRows<{ order_id: number | string; reply: string | null }>(conn, "SELECT order_id, reply FROM reviews WHERE id = ? FOR UPDATE", [input.reviewId]);
    if (!r) return { ok: false, error: "not-found" };
    await conn.query("UPDATE reviews SET reply = ?, replied_at = ? WHERE id = ?", [reply, reply ? toDbTime(now) : null, input.reviewId]);
    await appendAudit(conn, { actor: input.actor, action: reply ? "review.replied" : "review.reply-removed", objectType: "order", objectId: Number(r.order_id), after: { reviewId: input.reviewId } }, now);
    return { ok: true };
  });
}

/** Hidden or shown again — always with a reason, in the review and in the audit log (D-12). */
export async function setReviewVisibility(input: { reviewId: number; hide: boolean; reason: unknown; actor: string; now?: Date }): Promise<ReviewActionResult> {
  const reason = cleanReason(input.reason);
  if (!reason) return { ok: false, error: "reason-required" };
  const now = input.now ?? new Date();
  const from = input.hide ? "PUBLISHED" : "HIDDEN";
  const to = input.hide ? "HIDDEN" : "PUBLISHED";
  return withTransaction(async (conn): Promise<ReviewActionResult> => {
    const [r] = await selectRows<{ order_id: number | string }>(conn, "SELECT order_id FROM reviews WHERE id = ? FOR UPDATE", [input.reviewId]);
    if (!r) return { ok: false, error: "not-found" };
    const [res] = await conn.query("UPDATE reviews SET status = ?, hidden_reason = ? WHERE id = ? AND status = ?", [to, input.hide ? reason : null, input.reviewId, from]);
    if ((res as { affectedRows: number }).affectedRows !== 1) return { ok: false, error: "changed" };
    await appendAudit(conn, { actor: input.actor, action: input.hide ? "review.hidden" : "review.shown", objectType: "order", objectId: Number(r.order_id), before: { status: from }, after: { status: to, reviewId: input.reviewId }, reason }, now);
    return { ok: true };
  });
}
