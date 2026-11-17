// POST /api/stats — one page view (D-10, owner 2026-10-15: the shop's own
// statistics, without cookies). The body is only the path; nothing about the
// visitor is stored (src/lib/stats.ts). Our own Origin only, and a rate limit
// per visitor so a script cannot fill the table — the same hashed key as the
// other limits, gone after a day (docs/PRIVACY.md). Always 204: the page never
// waits for, or learns from, the answer.

import { hasDatabase } from "@/lib/db";
import { allowHit } from "@/lib/db/rate-limit";
import { fromOwnSite, readJson, visitorKey } from "@/lib/http";
import { siteUrl } from "@/lib/seo";
import { countedPath, recordView } from "@/lib/stats";

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  if (!hasDatabase || !fromOwnSite(request, siteUrl)) return done();
  const read = await readJson(request, 1024);
  if (!read.ok) return done();
  const path = countedPath((read.body as { path?: unknown } | null)?.path);
  if (!path) return done();
  try {
    if (await allowHit(`stats:${visitorKey(request)}`, 120, 10 * 60_000)) await recordView(path);
  } catch (err) {
    // A count is never worth an error for the visitor.
    console.error("[stats]", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown"));
  }
  return done();
}
