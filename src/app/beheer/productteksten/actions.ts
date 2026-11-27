"use server";

// Saving a product's own introduction (user 2026-11-27): only with the
// permission "productteksten". The action checks it itself — a server action
// is its own way in. Next.js compares the Origin with the host: the CSRF check.

import { revalidatePath } from "next/cache";
import { AdminAccessDenied, requireAction } from "@/lib/admin/access";
import { getProduct } from "@/lib/catalog/provider";
import { isProductId, saveProductTexts, type SaveTextsResult } from "@/lib/catalog/texts";

export type ProductTextsState = { ok: null } | SaveTextsResult | { ok: false; error: "access" | "product" };

export async function saveProductTextsAction(_: ProductTextsState, form: FormData): Promise<ProductTextsState> {
  let actor: string;
  try {
    actor = (await requireAction("productteksten")).actor;
  } catch (err) {
    if (err instanceof AdminAccessDenied) return { ok: false, error: "access" };
    throw err;
  }
  const productId = form.get("productId");
  // Only for a product that is in the shop: no rows for ids nobody can see.
  if (!isProductId(productId)) return { ok: false, error: "product" };
  const product = await getProduct("nl", productId);
  if (!product) return { ok: false, error: "product" };
  const version = Number(form.get("version"));
  const result = await saveProductTexts({
    source: product.source,
    productId,
    nl: form.get("nl"),
    en: form.get("en"),
    expectedVersion: Number.isSafeInteger(version) ? version : -1,
    actor,
  });
  revalidatePath("/beheer/productteksten");
  return result;
}
