// POST /api/cart — what the cart costs now. The browser sends references
// only (product, source, quantity); names, prices, stock and delivery come
// from the catalog (.claude/rules/geld.md § Wat de browser mag meesturen).
// Public on purpose (.claude/rules/beveiliging.md: deny by default, so this
// is the explicit exception): every visitor has a cart, and the answer holds
// only what the product pages already show. Read-only: it changes nothing, so
// it needs no CSRF check, and it calls no external service. POST because the
// cart travels in the body, never in a URL.
//
// With a discount code (docs/SCHERMEN.md: the code can go in the cart
// already) it reads the code from the database, so code lookups have a rate
// limit per visitor against guessing (.claude/rules/beveiliging.md § Rate
// limiting). "Once per customer" waits for the address, at checkout.

import { parseQuoteRequest, quoteCart, type QuoteCode } from "@/lib/cart/quote";
import { getCatalogOrUnavailable } from "@/lib/catalog/provider";
import { getPool, hasDatabase } from "@/lib/db";
import { allowHit } from "@/lib/db/rate-limit";
import { codeFloors, lookupCode } from "@/lib/discounts/codes";
import type { CodeLookup } from "@/lib/pricing/codes";
import { visitorKey } from "@/lib/http";

/** Quotes with a code per visitor (each change in the cart is one): plenty for a customer, too few to guess codes. */
const CODE_RATE = { max: 60, windowMs: 10 * 60_000 };

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

  const codeText = (body as { code?: unknown }).code;
  let code: QuoteCode | undefined;
  if (typeof codeText === "string" && codeText.trim() !== "") {
    if (codeText.length > 64) return json(400, { error: "code" });
    if (!hasDatabase) {
      code = { lookup: { kind: "refused", code: codeText.trim().toUpperCase(), reason: "unknown" }, floors: new Map() };
    } else {
      // Over the limit, or the database briefly out of reach: the cart still shows, without the code
      // and with the reason at the field (docs/SUPPLIER_RESILIENCE.md: an honest "not now").
      const later: CodeLookup = { kind: "refused", code: codeText.trim().toUpperCase().slice(0, 32), reason: "try-later" };
      let lookup: CodeLookup = later;
      try {
        if (await allowHit(`code:${visitorKey(request)}`, CODE_RATE.max, CODE_RATE.windowMs)) lookup = await lookupCode(getPool(), codeText, new Date());
      } catch (err) {
        console.error("[api/cart] code", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown"));
      }
      code = { lookup, floors: lookup.kind === "ok" ? await codeFloors(parsed.request.locale) : new Map() };
    }
  }
  return json(200, quoteCart(parsed.request.lines, catalog, undefined, code));
}
