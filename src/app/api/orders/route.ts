// POST /api/orders — what the customer may do from the status page: pay
// again, cancel inside the 30 minutes, change name, address, phone or e-mail
// (D-04). Access only with the key from the status link, sent in the body,
// not in a URL; an unknown key gets the same answer as a malformed one.
// Our own Origin only (CSRF), with a rate limit per visitor.

import { orderAction, RATE } from "@/lib/checkout";
import { hasDatabase } from "@/lib/db";
import { allowHit } from "@/lib/db/rate-limit";
import { fromOwnSite, json, readJson, visitorKey } from "@/lib/http";
import { siteUrl } from "@/lib/seo";

const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request): Promise<Response> {
  if (!hasDatabase) return json(404, { kind: "not-found" });
  if (!fromOwnSite(request, siteUrl)) return json(403, { error: "origin" });
  const read = await readJson(request, MAX_BODY_BYTES);
  if (!read.ok) return read.response;
  if (!(await allowHit(`order:${visitorKey(request)}`, RATE.orderAction.max, RATE.orderAction.windowMs))) return json(429, { error: "rate-limit" });

  const result = await orderAction(read.body);
  const status = result.kind === "not-found" ? 404 : result.kind === "invalid" ? 400 : result.kind === "window-closed" ? 409 : result.kind === "not-now" ? 503 : 200;
  return json(status, result);
}
