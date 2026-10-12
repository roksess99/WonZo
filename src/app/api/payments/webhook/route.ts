// POST /api/payments/webhook — Mollie says "something changed" with only an
// id, and no signature (D-05). The id is only a reason to ask Mollie; nothing
// in the call is believed (.claude/rules/beveiliging.md § Webhooks). 200 for
// a known and an unknown id alike; non-2xx only when we could not process it,
// so Mollie tries again (up to 10 times in about 26 hours).

import { hasDatabase } from "@/lib/db";
import { json } from "@/lib/http";
import { handleWebhook } from "@/lib/payments";
import { defaultProvider } from "@/lib/payments/mollie";

export async function POST(request: Request): Promise<Response> {
  if (!hasDatabase || !defaultProvider()) return json(200, {});
  const text = (await request.text()).slice(0, 1024);
  const id = new URLSearchParams(text).get("id") ?? "";
  try {
    await handleWebhook(id);
    return json(200, {});
  } catch (err) {
    // Database or provider out of reach: Mollie will call again; reconciliation catches the rest.
    console.error("[payments/webhook]", err instanceof Error ? err.name : "unknown");
    return json(500, {});
  }
}
