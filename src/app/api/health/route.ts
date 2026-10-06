// GET /api/health — is the shop up, and does it reach its database?
// For the check after every deploy (.claude/rules/database.md § Controles).
// Public on purpose and read-only: it says only "ok", "not configured" or
// "unreachable" and the id of the last migration — no host, no error text.

import { databaseStatus } from "@/lib/db";

export async function GET(): Promise<Response> {
  const database = await databaseStatus();
  const healthy = database.state !== "unreachable";
  return Response.json(
    { status: healthy ? "ok" : "degraded", database },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
