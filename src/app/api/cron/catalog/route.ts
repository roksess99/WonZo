// POST /api/cron/catalog — one slice of the catalog refresh (D-31). Called by
// the scheduled task on Hostinger every few minutes, and locally by
// scripts/catalog-sync.mjs. Each call works for at most ~40 s, within the
// supplier's limits, and the next call continues where it stopped.
//
// A cron URL is an ordinary URL to the outside world: a bearer token in the
// header, compared in constant time; the work claims itself in the database
// (GET_LOCK), so two calls never run together (.claude/rules/beveiliging.md
// § Geplande taken). Without JOB_TOKEN the route does not exist (404).

import { createHash, timingSafeEqual } from "node:crypto";
import { runSyncSlice } from "@/lib/catalog/sync";

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Same length, constant time: hash both sides first. */
function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  const secret = (process.env.JOB_TOKEN ?? "").trim();
  if (secret.length < 32) return json(404, { error: "not-found" });
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!given || !sameSecret(given, secret)) return json(401, { error: "unauthorized" });

  try {
    return json(200, await runSyncSlice());
  } catch (err) {
    // The full error goes to the server log; the answer names only its kind
    // (no host, no SQL). The progress is in the database: the next call retries.
    console.error("[cron/catalog]", err);
    const code = (err as { code?: unknown }).code;
    return json(500, { status: "error", error: typeof code === "string" ? code : err instanceof Error ? err.name : "unknown" });
  }
}
