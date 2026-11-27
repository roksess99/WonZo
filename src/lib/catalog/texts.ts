// The shop's own introduction to a product, per language (user 2026-11-27,
// after the SEO audit: the product texts are the supplier's word for word,
// the same as in every other shop that sells them). Written by the owner in
// the panel (/beheer/productteksten), shown under the product name, and put
// first in the meta description and the markup. Kept apart from the
// catalogue tables: those are refilled every night (D-31), this is not.
// Server-side only.

import { appendAudit } from "@/lib/admin/audit";
import { getPool, hasDatabase, selectRows, toDbTime, withTransaction, type Queryable } from "@/lib/db";
import type { Locale } from "@/lib/i18n/config";

/** The column width (db/migrations/0014_product_texts.sql): long enough for a few sentences, short enough to stay an introduction. */
export const INTRO_MAX = 600;

/**
 * A text from the form: trimmed, line ends as \n, at most two newlines in a
 * row, no control characters. Empty is allowed: no introduction. undefined:
 * not acceptable (too long, or not text).
 */
export function parseIntro(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(text)) return undefined;
  return [...text].length <= INTRO_MAX ? text : undefined;
}

/** A product id as the catalogue knows it: digits only (src/app/[lang]/product/[slug]/page.tsx). */
export const isProductId = (id: unknown): id is string => typeof id === "string" && /^\d{1,12}$/.test(id);

export type ProductTexts = { nl: string; en: string; version: number };

type Row = { intro_nl: string; intro_en: string; version: number | string };

/** The texts of one product; no row is version 0 with empty texts. */
export async function loadProductTexts(db: Queryable, source: string, productId: string): Promise<ProductTexts> {
  const [r] = await selectRows<Row>(db, "SELECT intro_nl, intro_en, version FROM product_texts WHERE source = ? AND product_id = ?", [source, productId]);
  return r ? { nl: r.intro_nl, en: r.intro_en, version: Number(r.version) } : { nl: "", en: "", version: 0 };
}

/** Which products have a text, for the list in the panel ("source:id" → languages that have one). */
export async function productsWithText(db: Queryable): Promise<Map<string, Locale[]>> {
  const rows = await selectRows<{ source: string; product_id: string; intro_nl: string; intro_en: string }>(
    db,
    "SELECT source, product_id, intro_nl, intro_en FROM product_texts WHERE intro_nl <> '' OR intro_en <> ''",
  );
  return new Map(rows.map((r) => [`${r.source}:${r.product_id}`, [...(r.intro_nl ? (["nl"] as const) : []), ...(r.intro_en ? (["en"] as const) : [])]]));
}

/**
 * The introduction for the product page, or null. Never breaks the page: a
 * database out of reach, or one before migration 0014, means no
 * introduction — the supplier's text is still there.
 */
export async function getProductIntro(locale: Locale, source: string, productId: string): Promise<string | null> {
  if (!hasDatabase) return null;
  try {
    const texts = await loadProductTexts(getPool(), source, productId);
    return texts[locale] || null;
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code !== "ER_NO_SUCH_TABLE") console.error("[catalog] product text", code ?? (err instanceof Error ? err.name : "unknown"));
    return null;
  }
}

export type SaveTextsResult = { ok: true; changed: boolean; version: number } | { ok: false; error: "too-long" | "changed" };

/**
 * Save both languages at once, only on the version the form showed (two
 * screens at the same time never overwrite each other quietly), with an
 * audit line in the same transaction. The caller checks the permission and
 * that the product exists.
 */
export async function saveProductTexts(input: {
  source: string;
  productId: string;
  nl: unknown;
  en: unknown;
  expectedVersion: number;
  actor: string;
  now?: Date;
}): Promise<SaveTextsResult> {
  const nl = parseIntro(input.nl);
  const en = parseIntro(input.en);
  if (nl === undefined || en === undefined) return { ok: false, error: "too-long" };
  const now = input.now ?? new Date();
  return withTransaction(async (conn): Promise<SaveTextsResult> => {
    const [cur] = await selectRows<Row>(conn, "SELECT intro_nl, intro_en, version FROM product_texts WHERE source = ? AND product_id = ? FOR UPDATE", [input.source, input.productId]);
    const before = cur ? { nl: cur.intro_nl, en: cur.intro_en } : { nl: "", en: "" };
    const version = cur ? Number(cur.version) : 0;
    if (version !== input.expectedVersion) return { ok: false, error: "changed" };
    if (before.nl === nl && before.en === en) return { ok: true, changed: false, version };
    const next = version + 1;
    await conn.query(
      `INSERT INTO product_texts (source, product_id, intro_nl, intro_en, version, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE intro_nl = VALUES(intro_nl), intro_en = VALUES(intro_en), version = VALUES(version), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)`,
      [input.source, input.productId, nl, en, next, toDbTime(now), input.actor.slice(0, 60)],
    );
    // The whole text before and after: shop copy, no personal data, and the only way back to an earlier version.
    await appendAudit(conn, { actor: input.actor, action: "product.text-changed", objectType: "product", objectId: `${input.source}:${input.productId}`, before, after: { nl, en } }, now);
    return { ok: true, changed: true, version: next };
  });
}
