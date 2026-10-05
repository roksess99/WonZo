// POST /api/cart — what the cart costs now. The browser sends references
// only (product, source, quantity); names, prices, stock and delivery come
// from the catalog (.claude/rules/geld.md § Wat de browser mag meesturen).
// Public on purpose (.claude/rules/beveiliging.md: deny by default, so this
// is the explicit exception): every visitor has a cart, and the answer holds
// only what the product pages already show. Read-only: it changes nothing, so
// it needs no CSRF check, and it calls no external service. POST because the
// cart travels in the body, never in a URL.

import { parseQuoteRequest, quoteCart } from "@/lib/cart/quote";
import { getCatalogOrUnavailable } from "@/lib/catalog/provider";

/** 50 lines of a few dozen bytes fit many times over. */
const MAX_BODY_BYTES = 16 * 1024;

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json(415, { error: "content-type" });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return json(413, { error: "too-large" });
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json(413, { error: "too-large" });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "json" });
  }
  const parsed = parseQuoteRequest(body);
  if (!parsed.ok) return json(400, { error: parsed.error });

  const catalog = await getCatalogOrUnavailable(parsed.request.locale);
  // docs/SUPPLIER_RESILIENCE.md: an honest "not now", which the cart page shows as such.
  if (!catalog) return json(503, { error: "supplier-unavailable" });
  return json(200, quoteCart(parsed.request.lines, catalog));
}
