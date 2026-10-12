// POST /api/checkout — place the order and start paying (docs/PAYMENTS.md
// steps 1–6). The browser sends the checkout key, the cart lines (references
// only), the language and the customer's details; every amount is the
// server's own (.claude/rules/geld.md). Changes something, so: our own
// Origin only (CSRF), a rate limit per visitor, and off until launch
// (CHECKOUT_ENABLED).

import { CHECKOUT_ON, RATE, checkout } from "@/lib/checkout";
import { hasDatabase } from "@/lib/db";
import { allowHit } from "@/lib/db/rate-limit";
import { fromOwnSite, json, readJson, visitorKey } from "@/lib/http";
import { siteUrl } from "@/lib/seo";

/** The cart (50 lines) plus the customer's details fit many times over. */
const MAX_BODY_BYTES = 24 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!CHECKOUT_ON || !hasDatabase) return json(503, { kind: "off" });
  if (!fromOwnSite(request, siteUrl)) return json(403, { error: "origin" });
  const read = await readJson(request, MAX_BODY_BYTES);
  if (!read.ok) return read.response;
  if (!(await allowHit(`checkout:${visitorKey(request)}`, RATE.checkout.max, RATE.checkout.windowMs))) return json(429, { error: "rate-limit" });

  const result = await checkout(read.body);
  switch (result.kind) {
    case "pay":
    case "order":
      return json(200, result);
    case "invalid":
      return json(400, result);
    case "not-ready":
      return json(409, result);
    case "conflict":
      return json(409, result);
    case "unavailable":
    case "off":
      return json(503, result);
  }
}
