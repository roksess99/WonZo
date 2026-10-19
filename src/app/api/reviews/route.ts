// /api/reviews (D-12, owner 2026-10-15).
// GET  ?source=&product= — the published reviews of one product, for the
//      product page (public; no names of customers beyond the one they chose).
// POST {action: "submit" | "optout", token, …} — the review form and the
//      opt-out, only with the key from the invitation, in the body. Our own
//      Origin only (CSRF), with a rate limit per visitor.

import { hasDatabase, getPool } from "@/lib/db";
import { allowHit } from "@/lib/db/rate-limit";
import { fromOwnSite, json, readJson, visitorKey } from "@/lib/http";
import { optOutOfInvites, publicReviews, submitReviews } from "@/lib/reviews";
import { siteUrl } from "@/lib/seo";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const source = url.searchParams.get("source") ?? "";
  const productId = url.searchParams.get("product") ?? "";
  if (!/^[a-z]{1,20}$/.test(source) || !/^[A-Za-z0-9_-]{1,20}$/.test(productId)) return json(400, { error: "product" });
  if (!hasDatabase) return json(200, { summary: { count: 0, average: null, perStar: [0, 0, 0, 0, 0] }, reviews: [] });
  try {
    const r = await publicReviews(getPool(), { subject: "product", source, productId }, 20);
    // Public and the same for everyone: a minute in a shared cache is fine.
    return Response.json(r, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
  } catch (err) {
    console.error("[reviews] list", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown"));
    return json(503, { error: "unavailable" });
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!hasDatabase) return json(404, { kind: "not-found" });
  if (!fromOwnSite(request, siteUrl)) return json(403, { error: "origin" });
  const read = await readJson(request, 64 * 1024);
  if (!read.ok) return read.response;
  if (!(await allowHit(`review:${visitorKey(request)}`, 20, 10 * 60_000))) return json(429, { error: "rate-limit" });
  const body = typeof read.body === "object" && read.body !== null ? (read.body as Record<string, unknown>) : {};
  if (body.action === "optout") {
    return (await optOutOfInvites(body.token)) ? json(200, { kind: "done" }) : json(404, { kind: "not-found" });
  }
  if (body.action === "submit") {
    const r = await submitReviews(body);
    const status = r.kind === "done" ? 200 : r.kind === "not-found" ? 404 : r.kind === "invalid" ? 400 : 409;
    return json(status, r);
  }
  return json(400, { error: "action" });
}
