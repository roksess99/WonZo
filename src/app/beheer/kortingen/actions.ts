"use server";

// Promotions and discount codes (D-08): with the permission "kortingen" (owner and marketing,
// D-07). Each action checks it itself — a server action is its own way in.
// Next.js compares the Origin with the host: the CSRF check.

import { revalidatePath } from "next/cache";
import { AdminAccessDenied, requireAction } from "@/lib/admin/access";
import { forgetPricing, getCatalog } from "@/lib/catalog/provider";
import { amsterdamLocalToInstant } from "@/lib/dates";
import { createCode, stopCode, type CodeResult } from "@/lib/discounts/codes";
import { recordPrices } from "@/lib/discounts/history";
import { checkTarget, createPromotion, stopPromotion, type PromotionResult } from "@/lib/discounts/store";

export type PromotionState = { ok: null } | PromotionResult | { ok: false; error: "access" | "product" };
export type CodeState = { ok: null } | CodeResult;

async function actor(): Promise<string | null> {
  try {
    return (await requireAction("kortingen")).actor;
  } catch (err) {
    if (err instanceof AdminAccessDenied) return null;
    throw err;
  }
}

async function afterChange(): Promise<void> {
  forgetPricing();
  await recordPrices(new Date()).catch((err: unknown) => console.error("[beheer/kortingen] history", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown")));
  revalidatePath("/beheer/kortingen");
}

const text = (x: FormDataEntryValue | null) => (typeof x === "string" ? x : "");

export async function createPromotionAction(_: PromotionState, form: FormData): Promise<PromotionState> {
  const who = await actor();
  if (!who) return { ok: false, error: "access" };
  const kind = text(form.get("kind"));
  let key = text(kind === "category" ? form.get("category") : kind === "subcategory" ? form.get("subcategory") : form.get("product")).trim();
  if (kind === "product") {
    // The owner knows the article number from the product page; the rule hangs on the id (.claude/rules/catalogus.md § Identiteit).
    const wanted = key.toUpperCase();
    const p = (await getCatalog("nl")).find((x) => x.sku.toUpperCase() === wanted || x.id === key);
    if (!p) return { ok: false, error: "product" };
    key = p.id;
  }
  const result = await createPromotion({
    name: form.get("name"),
    target: checkTarget(kind, key),
    percent: form.get("percent"),
    startsAt: amsterdamLocalToInstant(text(form.get("startsAt"))),
    endsAt: amsterdamLocalToInstant(text(form.get("endsAt"))),
    actor: who,
  });
  if (result.ok) await afterChange();
  return result;
}

export async function stopPromotionAction(_: PromotionState, form: FormData): Promise<PromotionState> {
  const who = await actor();
  if (!who) return { ok: false, error: "access" };
  const result = await stopPromotion({ id: text(form.get("promotionId")), actor: who });
  if (result.ok) await afterChange();
  return result;
}

// A code changes no catalog price: no new pricing, no price history — only the page.

export async function createCodeAction(_: CodeState, form: FormData): Promise<CodeState> {
  const who = await actor();
  if (!who) return { ok: false, error: "access" };
  const result = await createCode({
    code: form.get("code"),
    percent: form.get("percent"),
    minSubtotal: text(form.get("minSubtotal")),
    maxUses: text(form.get("maxUses")),
    startsAt: amsterdamLocalToInstant(text(form.get("startsAt"))),
    endsAt: amsterdamLocalToInstant(text(form.get("endsAt"))),
    actor: who,
  });
  if (result.ok) revalidatePath("/beheer/kortingen");
  return result;
}

export async function stopCodeAction(_: CodeState, form: FormData): Promise<CodeState> {
  const who = await actor();
  if (!who) return { ok: false, error: "access" };
  const result = await stopCode({ id: text(form.get("codeId")), actor: who });
  if (result.ok) revalidatePath("/beheer/kortingen");
  return result;
}
