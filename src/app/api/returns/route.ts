// POST /api/returns — the return form (D-09, owner 2026-10-13): first
// "lookup" with the e-mail address of the order and the invoice number, then
// "submit" with the pieces and a reason per line. Both in the body, never in a
// URL (an address is personal data). The two keys are checked again on
// submit: the form keeps no state on the server between the steps. Every miss
// gets the same answer (docs/RETOUREN.md § Controleren zonder een lek te
// maken). Our own Origin only (CSRF); a rate limit per visitor, and per
// invoice number so one invoice cannot be tried with many addresses.

import { createHash } from "node:crypto";
import { hasDatabase } from "@/lib/db";
import { allowHit } from "@/lib/db/rate-limit";
import { fromOwnSite, json, readJson, visitorKey } from "@/lib/http";
import { lookupReturn, parseReturnKey, requestReturn } from "@/lib/returns";
import { siteUrl } from "@/lib/seo";

const MAX_BODY_BYTES = 8 * 1024;
/** A technical bound against trying, not a shop policy (.claude/rules/beveiliging.md § Webverzoeken). */
const RETURN_RATE = { visitor: { max: 20, windowMs: 10 * 60_000 }, invoice: { max: 10, windowMs: 60 * 60_000 } };

export async function POST(request: Request): Promise<Response> {
  if (!hasDatabase) return json(404, { kind: "not-found" });
  if (!fromOwnSite(request, siteUrl)) return json(403, { error: "origin" });
  const read = await readJson(request, MAX_BODY_BYTES);
  if (!read.ok) return read.response;
  const body = typeof read.body === "object" && read.body !== null ? (read.body as Record<string, unknown>) : {};
  if (!(await allowHit(`return:${visitorKey(request)}`, RETURN_RATE.visitor.max, RETURN_RATE.visitor.windowMs))) return json(429, { error: "rate-limit" });
  const key = parseReturnKey(body);
  if (!key) return json(400, { kind: "invalid", error: "key" });
  // The invoice number hashed: the bucket names nothing a log reader could use.
  const invoiceBucket = `return-invoice:${createHash("sha256").update(key.invoice).digest("hex").slice(0, 32)}`;
  if (!(await allowHit(invoiceBucket, RETURN_RATE.invoice.max, RETURN_RATE.invoice.windowMs))) return json(429, { error: "rate-limit" });

  if (body.action === "lookup") {
    const r = await lookupReturn(key);
    if (r.kind === "not-found") return json(404, r);
    if (r.kind === "not-returnable") return json(409, r);
    return json(200, r);
  }
  if (body.action === "submit") {
    const r = await requestReturn({ ...key, lines: body.lines, note: body.note });
    const status = r.kind === "requested" ? 200 : r.kind === "not-found" ? 404 : r.kind === "not-returnable" ? 409 : 400;
    return json(status, r);
  }
  return json(400, { kind: "invalid", error: "action" });
}
