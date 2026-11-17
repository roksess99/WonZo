// Price rules and promotions in the database (D-03, D-08, D-16;
// docs/PRIJZEN.md). The arithmetic is src/lib/pricing/rules.ts; this file
// reads and writes what the owner set, checks it at the edge and writes the
// audit line in the same transaction. Every change raises
// price_settings.version, so the catalog prices again (src/lib/catalog/provider.ts).
// Server-side only.

import { appendAudit } from "@/lib/admin/audit";
import { assortment } from "@/lib/catalog/assortment";
import { fromDbTime, selectRows, toDbTime, withTransaction, type Connection, type Queryable } from "@/lib/db";
import { parseEuro, parsePercent } from "@/lib/pricing/input";
import { MAX_MARKUP_BP, MAX_PROMOTION_BP, MIN_PROMOTION_BP, subcategoryRuleKey, type PriceRules, type Promotion, type PromotionTarget } from "@/lib/pricing/rules";

export type Pricing = { version: number; rules: PriceRules; promotions: Promotion[] };

/** The subcategories a rule may hang on, "category/subcategory": the assortment's own (D-02). */
export const RULE_KEYS: readonly string[] = assortment.flatMap((c) => c.subcategories.map((s) => subcategoryRuleKey(c.key, s.key)));
const CATEGORY_KEYS: readonly string[] = assortment.map((c) => c.key);

type SettingsRow = { default_markup_bp: number | string | null; payment_cost_cents: number | string; version: number | string };
type PromotionRow = {
  id: number | string; name: string; target_kind: string; target_key: string; percent_bp: number | string;
  starts_at: string; ends_at: string; created_at: string; created_by: string; stopped_at: string | null; stopped_by: string | null;
};

const isKind = (k: string): k is PromotionTarget["kind"] => k === "category" || k === "subcategory" || k === "product";

function toPromotion(r: PromotionRow): Promotion | null {
  if (!isKind(r.target_kind)) return null;
  return { id: String(r.id), name: r.name, target: { kind: r.target_kind, key: r.target_key }, percentBp: Number(r.percent_bp), startsAt: fromDbTime(r.starts_at), endsAt: fromDbTime(r.ends_at) };
}

async function readSettings(db: Queryable): Promise<{ defaultMarkupBp: number | null; paymentCostCents: number; version: number }> {
  const [s] = await selectRows<SettingsRow>(db, "SELECT default_markup_bp, payment_cost_cents, version FROM price_settings WHERE id = 1");
  return { defaultMarkupBp: s?.default_markup_bp === null || s?.default_markup_bp === undefined ? null : Number(s.default_markup_bp), paymentCostCents: s ? Number(s.payment_cost_cents) : 0, version: s ? Number(s.version) : 0 };
}

/** What the catalog prices with: the rules, and the promotions that have not ended yet (upcoming ones too). */
export async function loadPricing(db: Queryable, now: Date): Promise<Pricing> {
  const settings = await readSettings(db);
  const markups = await selectRows<{ rule_key: string; markup_bp: number | string }>(db, "SELECT rule_key, markup_bp FROM price_markups");
  const promos = await selectRows<PromotionRow>(db, "SELECT * FROM promotions WHERE ends_at > ? ORDER BY starts_at, id", [toDbTime(now)]);
  return {
    version: settings.version,
    rules: {
      defaultMarkupBp: settings.defaultMarkupBp,
      paymentCostCents: settings.paymentCostCents,
      markups: new Map(markups.filter((m) => RULE_KEYS.includes(m.rule_key)).map((m) => [m.rule_key, Number(m.markup_bp)])),
    },
    promotions: promos.map(toPromotion).filter((p): p is Promotion => p !== null),
  };
}

/** Only the version: the catalog asks this every minute and loads the rest when it changed. */
export async function pricingVersion(db: Queryable): Promise<number> {
  return (await readSettings(db)).version;
}

async function bumpVersion(conn: Connection, actor: string, now: Date): Promise<void> {
  await conn.query("INSERT IGNORE INTO price_settings (id, default_markup_bp, payment_cost_cents, version) VALUES (1, NULL, 0, 0)");
  await conn.query("UPDATE price_settings SET version = version + 1, updated_at = ?, updated_by = ? WHERE id = 1", [toDbTime(now), actor.slice(0, 60)]);
}

// ---------------------------------------------------------------- the price rule

export type RulesError = "markup" | "subcategory-markup" | "payment-cost" | "changed";
export type RulesResult = { ok: true; changed: boolean } | { ok: false; error: RulesError; key?: string };

/**
 * Saves the default markup, the payment costs and the markups per
 * subcategory in one go. `expectedVersion` is the version the form showed:
 * someone else saved in between → refused, so nobody overwrites a change
 * they never saw. Out of range is refused, not clipped (docs/PRIJZEN.md § 1).
 */
export async function savePriceRules(input: {
  defaultMarkup: unknown;
  paymentCost: unknown;
  markups: Record<string, unknown>;
  expectedVersion: number;
  actor: string;
  now?: Date;
}): Promise<RulesResult> {
  const defaultMarkupBp = parsePercent(input.defaultMarkup);
  if (defaultMarkupBp === undefined || (defaultMarkupBp !== null && defaultMarkupBp > MAX_MARKUP_BP)) return { ok: false, error: "markup" };
  const paymentCostCents = parseEuro(input.paymentCost);
  if (paymentCostCents === undefined || paymentCostCents > 10_000) return { ok: false, error: "payment-cost" };
  const markups = new Map<string, number>();
  for (const key of RULE_KEYS) {
    const bp = parsePercent(input.markups[key]);
    if (bp === undefined || (bp !== null && bp > MAX_MARKUP_BP)) return { ok: false, error: "subcategory-markup", key };
    if (bp !== null) markups.set(key, bp);
  }
  const now = input.now ?? new Date();
  return withTransaction(async (conn): Promise<RulesResult> => {
    await conn.query("INSERT IGNORE INTO price_settings (id, default_markup_bp, payment_cost_cents, version) VALUES (1, NULL, 0, 0)");
    const [cur] = await selectRows<SettingsRow>(conn, "SELECT default_markup_bp, payment_cost_cents, version FROM price_settings WHERE id = 1 FOR UPDATE");
    if (Number(cur!.version) !== input.expectedVersion) return { ok: false, error: "changed" };
    const oldMarkups = new Map((await selectRows<{ rule_key: string; markup_bp: number | string }>(conn, "SELECT rule_key, markup_bp FROM price_markups FOR UPDATE")).map((m) => [m.rule_key, Number(m.markup_bp)]));
    const before = { defaultMarkupBp: cur!.default_markup_bp === null ? null : Number(cur!.default_markup_bp), paymentCostCents: Number(cur!.payment_cost_cents), markups: Object.fromEntries(oldMarkups) };
    const after = { defaultMarkupBp, paymentCostCents, markups: Object.fromEntries(markups) };
    if (JSON.stringify(before) === JSON.stringify(after)) return { ok: true, changed: false };

    await conn.query("UPDATE price_settings SET default_markup_bp = ?, payment_cost_cents = ? WHERE id = 1", [defaultMarkupBp, paymentCostCents]);
    for (const key of oldMarkups.keys()) if (!markups.has(key)) await conn.query("DELETE FROM price_markups WHERE rule_key = ?", [key]);
    for (const [key, bp] of markups) {
      await conn.query(
        "INSERT INTO price_markups (rule_key, markup_bp, updated_at, updated_by) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE markup_bp = VALUES(markup_bp), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)",
        [key, bp, toDbTime(now), input.actor.slice(0, 60)],
      );
    }
    await bumpVersion(conn, input.actor, now);
    // Prices are no personal data: old and new value in the log (.claude/rules/beveiliging.md § Destructieve en financiële handelingen).
    await appendAudit(conn, { actor: input.actor, action: "prices.rules", objectType: "prices", objectId: "rules", before, after }, now);
    return { ok: true, changed: true };
  });
}

// ---------------------------------------------------------------- promotions

export type PromotionError = "name" | "target" | "percent" | "dates" | "not-found" | "ended";
export type PromotionResult = { ok: true; id: string } | { ok: false; error: PromotionError };

/** A target the assortment knows; a product must already be resolved to its id by the caller (who has the catalog). */
export function checkTarget(kind: unknown, key: unknown): PromotionTarget | null {
  if (typeof kind !== "string" || typeof key !== "string" || !isKind(kind)) return null;
  if (kind === "category") return CATEGORY_KEYS.includes(key) ? { kind, key } : null;
  if (kind === "subcategory") return RULE_KEYS.includes(key) ? { kind, key } : null;
  return /^\d{1,12}$/.test(key) ? { kind, key } : null;
}

export async function createPromotion(input: { name: unknown; target: PromotionTarget | null; percent: unknown; startsAt: Date | null; endsAt: Date | null; actor: string; now?: Date }): Promise<PromotionResult> {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 80) return { ok: false, error: "name" };
  if (!input.target) return { ok: false, error: "target" };
  const percentBp = parsePercent(input.percent);
  if (typeof percentBp !== "number" || percentBp < MIN_PROMOTION_BP || percentBp > MAX_PROMOTION_BP) return { ok: false, error: "percent" };
  const now = input.now ?? new Date();
  const { startsAt, endsAt } = input;
  // An end after the start and in the future; a start may be now or later (a few minutes back counts as now).
  if (!startsAt || !endsAt || endsAt.getTime() <= startsAt.getTime() || endsAt.getTime() <= now.getTime() || startsAt.getTime() < now.getTime() - 10 * 60_000) return { ok: false, error: "dates" };
  const target = input.target;
  return withTransaction(async (conn): Promise<PromotionResult> => {
    const [res] = await conn.query(
      "INSERT INTO promotions (name, target_kind, target_key, percent_bp, starts_at, ends_at, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [name, target.kind, target.key, percentBp, toDbTime(startsAt), toDbTime(endsAt), toDbTime(now), input.actor.slice(0, 60)],
    );
    const id = String((res as { insertId: number }).insertId);
    await bumpVersion(conn, input.actor, now);
    await appendAudit(conn, { actor: input.actor, action: "promotion.created", objectType: "promotion", objectId: id, after: { name, target, percentBp, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } }, now);
    return { ok: true, id };
  });
}

/** Stops a running or upcoming promotion now. Its row stays, with the end set to now (docs/PRIJZEN.md § 2: stopping is not throwing away). */
export async function stopPromotion(input: { id: string; actor: string; now?: Date }): Promise<PromotionResult> {
  if (!/^\d{1,18}$/.test(input.id)) return { ok: false, error: "not-found" };
  const now = input.now ?? new Date();
  return withTransaction(async (conn): Promise<PromotionResult> => {
    const [r] = await selectRows<PromotionRow>(conn, "SELECT * FROM promotions WHERE id = ? FOR UPDATE", [input.id]);
    if (!r) return { ok: false, error: "not-found" };
    const startsAt = fromDbTime(r.starts_at), endsAt = fromDbTime(r.ends_at);
    if (endsAt.getTime() <= now.getTime()) return { ok: false, error: "ended" };
    // An upcoming one ends at its start: it never ran.
    const end = new Date(Math.max(startsAt.getTime(), now.getTime()));
    await conn.query("UPDATE promotions SET ends_at = ?, stopped_at = ?, stopped_by = ? WHERE id = ?", [toDbTime(end), toDbTime(now), input.actor.slice(0, 60), input.id]);
    await bumpVersion(conn, input.actor, now);
    await appendAudit(conn, { actor: input.actor, action: "promotion.stopped", objectType: "promotion", objectId: input.id, before: { endsAt: endsAt.toISOString() }, after: { endsAt: end.toISOString() } }, now);
    return { ok: true, id: input.id };
  });
}

export type PromotionListRow = Promotion & { createdAt: Date; createdBy: string; stoppedAt: Date | null; state: "upcoming" | "running" | "ended" };

/** For the panel: running and upcoming first, then the last 50 that ended. */
export async function listPromotions(db: Queryable, now: Date): Promise<PromotionListRow[]> {
  const rows = [
    ...(await selectRows<PromotionRow>(db, "SELECT * FROM promotions WHERE ends_at > ? ORDER BY starts_at, id", [toDbTime(now)])),
    ...(await selectRows<PromotionRow>(db, "SELECT * FROM promotions WHERE ends_at <= ? ORDER BY ends_at DESC, id DESC LIMIT 50", [toDbTime(now)])),
  ];
  return rows.flatMap((r) => {
    const p = toPromotion(r);
    if (!p) return [];
    const state = p.endsAt.getTime() <= now.getTime() ? "ended" : p.startsAt.getTime() > now.getTime() ? "upcoming" : "running";
    return [{ ...p, createdAt: fromDbTime(r.created_at), createdBy: r.created_by, stoppedAt: r.stopped_at ? fromDbTime(r.stopped_at) : null, state }];
  });
}
