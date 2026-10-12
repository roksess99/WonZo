// What every API route checks on a request from outside
// (.claude/rules/beveiliging.md § Webverzoeken): a JSON body of bounded size,
// the Origin of a request that changes something (CSRF), the bearer token of
// a scheduled task, and a key per visitor for the rate limit.

import { createHash, timingSafeEqual } from "node:crypto";

export const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The body as JSON, or the answer to give: 415, 413 or 400. */
export async function readJson(request: Request, maxBytes: number): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return { ok: false, response: json(415, { error: "content-type" }) };
  if (Number(request.headers.get("content-length") ?? "0") > maxBytes) return { ok: false, response: json(413, { error: "too-large" }) };
  const text = await request.text();
  if (text.length > maxBytes) return { ok: false, response: json(413, { error: "too-large" }) };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: json(400, { error: "json" }) };
  }
}

/**
 * CSRF for a request that changes something: the browser's Origin must be
 * our own site. A missing Origin is refused too — every current browser
 * sends it with a POST from a page.
 */
export function fromOwnSite(request: Request, site: URL): boolean {
  return request.headers.get("origin") === site.origin;
}

/** Same length, constant time: hash both sides first. */
export function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * A scheduled task's bearer token (§ Geplande taken). Without JOB_TOKEN the
 * route does not exist (404); a wrong or missing token gets 401. null: allowed.
 */
export function refuseJob(request: Request): Response | null {
  const secret = (process.env.JOB_TOKEN ?? "").trim();
  if (secret.length < 32) return json(404, { error: "not-found" });
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!given || !sameSecret(given, secret)) return json(401, { error: "unauthorized" });
  return null;
}

/**
 * A key per visitor for the rate limit: a hash of the address, never the
 * address itself (docs/PRIVACY.md). AANNAME: behind Hostinger's CDN the
 * visitor's address is the first entry of X-Forwarded-For — to measure live.
 */
export function visitorKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`wonzo-rate:${address}`).digest("hex").slice(0, 32);
}
