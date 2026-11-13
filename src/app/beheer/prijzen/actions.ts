"use server";

// Saving the price rule (D-03, D-16): only with the permission "prijzen",
// which stays with the owner (D-07). The action checks it itself — a server
// action is its own way in. Next.js compares the Origin with the host: the
// CSRF check.

import { revalidatePath } from "next/cache";
import { AdminAccessDenied, requireAction } from "@/lib/admin/access";
import { forgetPricing } from "@/lib/catalog/provider";
import { recordPrices } from "@/lib/discounts/history";
import { RULE_KEYS, savePriceRules, type RulesResult } from "@/lib/discounts/store";

export type PriceRulesState = { ok: null } | RulesResult | { ok: false; error: "access" };

export async function savePriceRulesAction(_: PriceRulesState, form: FormData): Promise<PriceRulesState> {
  let actor: string;
  try {
    actor = (await requireAction("prijzen")).actor;
  } catch (err) {
    if (err instanceof AdminAccessDenied) return { ok: false, error: "access" };
    throw err;
  }
  const version = Number(form.get("version"));
  const result = await savePriceRules({
    defaultMarkup: form.get("defaultMarkup"),
    paymentCost: form.get("paymentCost"),
    markups: Object.fromEntries(RULE_KEYS.map((k) => [k, form.get(`markup:${k}`)])),
    expectedVersion: Number.isSafeInteger(version) ? version : -1,
    actor,
  });
  if (result.ok && result.changed) {
    // This process prices again right away; the others within the minute (src/lib/catalog/provider.ts).
    forgetPricing();
    await recordPrices(new Date()).catch((err: unknown) => console.error("[beheer/prijzen] history", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown")));
  }
  revalidatePath("/beheer/prijzen");
  return result;
}
