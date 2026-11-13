// Discount codes in the database (D-08, docs/PRIJZEN.md § 3). The arithmetic
// is src/lib/pricing/codes.ts; this file looks a code up, checks it at the
// edge, writes it with an audit line, and marks it used once the order is
// paid. "Once per customer" is a unique key on (code, hash of the e-mail
// address), so the database decides — two tabs cannot both use it.
// Server-side only.

import { createHash } from "node:crypto";
import { appendAudit } from "@/lib/admin/audit";
import { getPricedCatalog } from "@/lib/catalog/provider";
import { fromDbTime, isDuplicateKey, selectRows, toDbTime, withTransaction, type Connection, type Queryable } from "@/lib/db";
import type { Locale } from "@/lib/i18n/config";
import type { Money } from "@/lib/money";
import { normalizeCode, type CodeLookup } from "@/lib/pricing/codes";
import { parseEuro, parsePercent } from "@/lib/pricing/input";
import { MAX_PROMOTION_BP, MIN_PROMOTION_BP } from "@/lib/pricing/rules";

/** The key of an address for "once per customer": its hash, so the table holds no addresses (docs/PRIVACY.md). */
export const codeEmailHash = (email: string) => createHash("sha256").update(`wonzo-code-customer:${email.trim().toLowerCase()}`).digest("hex");

type CodeRow = {
  id: number | string; code: string; percent_bp: number | string; min_subtotal_cents: number | string; max_uses: number | string | null;
  starts_at: string; ends_at: string; created_at: string; created_by: string; stopped_at: string | null; stopped_by: string | null;
};

const usesOf = async (db: Queryable, codeId: string) =>
  Number((await selectRows<{ n: number | string }>(db, "SELECT COUNT(*) AS n FROM discount_redemptions WHERE code_id = ?", [codeId]))[0]?.n ?? 0);

/**
 * What a code text means right now. With an e-mail address (at checkout) also
 * whether this customer used it already. A code that has not started yet
 * reads as unknown: the answer does not give away what is coming.
 */
export async function lookupCode(db: Queryable, text: unknown, now: Date, email?: string): Promise<CodeLookup> {
  const code = normalizeCode(text);
  const shown = typeof text === "string" ? text.trim().toUpperCase().slice(0, 32) : "";
  if (!code) return { kind: "refused", code: shown, reason: "unknown" };
  const [r] = await selectRows<CodeRow>(db, "SELECT * FROM discount_codes WHERE code = ?", [code]);
  if (!r || fromDbTime(r.starts_at).getTime() > now.getTime()) return { kind: "refused", code, reason: "unknown" };
  if (fromDbTime(r.ends_at).getTime() <= now.getTime()) return { kind: "refused", code, reason: "ended" };
  const id = String(r.id);
  if (r.max_uses !== null && (await usesOf(db, id)) >= Number(r.max_uses)) return { kind: "refused", code, reason: "exhausted" };
  if (email) {
    const [used] = await selectRows<{ x: number }>(db, "SELECT 1 AS x FROM discount_redemptions WHERE code_id = ? AND email_hash = ?", [id, codeEmailHash(email)]);
    if (used) return { kind: "refused", code, reason: "used" };
  }
  return { kind: "ok", code: { id, code, percentBp: Number(r.percent_bp), minSubtotalCents: Number(r.min_subtotal_cents) } };
}

/** The floor per piece of every product, "source:id" (D-16): a code never takes a line below it. Server-side only. */
export async function codeFloors(locale: Locale): Promise<Map<string, Money>> {
  return new Map((await getPricedCatalog(locale)).map((e) => [`${e.product.source}:${e.product.id}`, e.pricing.floor]));
}

export type RedeemOutcome = "none" | "redeemed" | "already" | "used" | "exhausted";

/**
 * Marks the code of an order as used, inside the transaction that makes the
 * order PAID (docs/PRIJZEN.md § 3: only after payment). "used" and
 * "exhausted": another paid order was first — the caller holds the order for
 * the owner, never a silent extra discount. The code row is locked, so two
 * payments at once count the maximum correctly.
 */
export async function redeemOrderCode(conn: Connection, orderId: number, now: Date): Promise<RedeemOutcome> {
  const [o] = await selectRows<{ discount_code_id: number | string | null; email: string }>(conn, "SELECT discount_code_id, email FROM orders WHERE id = ?", [orderId]);
  if (!o || o.discount_code_id === null) return "none";
  const codeId = String(o.discount_code_id);
  const [c] = await selectRows<{ max_uses: number | string | null }>(conn, "SELECT max_uses FROM discount_codes WHERE id = ? FOR UPDATE", [codeId]);
  const [mine] = await selectRows<{ x: number }>(conn, "SELECT 1 AS x FROM discount_redemptions WHERE order_id = ?", [orderId]);
  if (mine) return "already";
  if (c && c.max_uses !== null && (await usesOf(conn, codeId)) >= Number(c.max_uses)) return "exhausted";
  try {
    await conn.query("INSERT INTO discount_redemptions (code_id, order_id, email_hash, redeemed_at) VALUES (?, ?, ?, ?)", [codeId, orderId, codeEmailHash(o.email), toDbTime(now)]);
  } catch (err) {
    if (isDuplicateKey(err)) return "used";
    throw err;
  }
  return "redeemed";
}

// ------------------------------------------------------------- the panel

export type CodeError = "code" | "taken" | "percent" | "min" | "max-uses" | "dates" | "not-found" | "ended" | "access";
export type CodeResult = { ok: true; id: string } | { ok: false; error: CodeError };

/** A new code. Out of range is refused, never clipped (.claude/rules/geld.md § Buiten bereik). */
export async function createCode(input: { code: unknown; percent: unknown; minSubtotal: unknown; maxUses: unknown; startsAt: Date | null; endsAt: Date | null; actor: string; now?: Date }): Promise<CodeResult> {
  const code = normalizeCode(input.code);
  if (!code) return { ok: false, error: "code" };
  const percentBp = parsePercent(input.percent);
  if (typeof percentBp !== "number" || percentBp < MIN_PROMOTION_BP || percentBp > MAX_PROMOTION_BP) return { ok: false, error: "percent" };
  const minText = typeof input.minSubtotal === "string" ? input.minSubtotal.trim() : "";
  const min = minText === "" ? 0 : parseEuro(minText);
  if (min === undefined || min > 10_000_000) return { ok: false, error: "min" };
  const maxText = typeof input.maxUses === "string" ? input.maxUses.trim() : "";
  if (maxText !== "" && !/^\d{1,6}$/.test(maxText)) return { ok: false, error: "max-uses" };
  const maxUses = maxText === "" ? null : Number(maxText);
  if (maxUses === 0) return { ok: false, error: "max-uses" };
  const now = input.now ?? new Date();
  const { startsAt, endsAt } = input;
  // The same rule as a promotion: an end after the start and in the future, a start now or later (a few minutes back counts as now).
  if (!startsAt || !endsAt || endsAt.getTime() <= startsAt.getTime() || endsAt.getTime() <= now.getTime() || startsAt.getTime() < now.getTime() - 10 * 60_000) return { ok: false, error: "dates" };
  try {
    return await withTransaction(async (conn): Promise<CodeResult> => {
      const [res] = await conn.query(
        "INSERT INTO discount_codes (code, percent_bp, min_subtotal_cents, max_uses, starts_at, ends_at, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [code, percentBp, min, maxUses, toDbTime(startsAt), toDbTime(endsAt), toDbTime(now), input.actor.slice(0, 60)],
      );
      const id = String((res as { insertId: number }).insertId);
      await appendAudit(conn, { actor: input.actor, action: "code.created", objectType: "discount-code", objectId: id, after: { code, percentBp, minSubtotalCents: min, maxUses, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } }, now);
      return { ok: true, id };
    });
  } catch (err) {
    // The code text is unique, also over ended codes: an old code never comes back with another meaning.
    if (isDuplicateKey(err)) return { ok: false, error: "taken" };
    throw err;
  }
}

/** Stops a code now; its row and its uses stay. An order already placed with it can still be paid. */
export async function stopCode(input: { id: string; actor: string; now?: Date }): Promise<CodeResult> {
  if (!/^\d{1,18}$/.test(input.id)) return { ok: false, error: "not-found" };
  const now = input.now ?? new Date();
  return withTransaction(async (conn): Promise<CodeResult> => {
    const [r] = await selectRows<CodeRow>(conn, "SELECT * FROM discount_codes WHERE id = ? FOR UPDATE", [input.id]);
    if (!r) return { ok: false, error: "not-found" };
    const startsAt = fromDbTime(r.starts_at), endsAt = fromDbTime(r.ends_at);
    if (endsAt.getTime() <= now.getTime()) return { ok: false, error: "ended" };
    const end = new Date(Math.max(startsAt.getTime(), now.getTime()));
    await conn.query("UPDATE discount_codes SET ends_at = ?, stopped_at = ?, stopped_by = ? WHERE id = ?", [toDbTime(end), toDbTime(now), input.actor.slice(0, 60), input.id]);
    await appendAudit(conn, { actor: input.actor, action: "code.stopped", objectType: "discount-code", objectId: input.id, before: { endsAt: endsAt.toISOString() }, after: { endsAt: end.toISOString() } }, now);
    return { ok: true, id: input.id };
  });
}

export type CodeListRow = {
  id: string; code: string; percentBp: number; minSubtotalCents: number; maxUses: number | null; uses: number;
  startsAt: Date; endsAt: Date; createdAt: Date; createdBy: string; stoppedAt: Date | null; state: "upcoming" | "running" | "ended";
};

/** For the panel: open codes first, then the last 50 that ended; each with how often it was used (paid orders). */
export async function listCodes(db: Queryable, now: Date): Promise<CodeListRow[]> {
  const select = "SELECT c.*, (SELECT COUNT(*) FROM discount_redemptions d WHERE d.code_id = c.id) AS uses FROM discount_codes c";
  const rows = [
    ...(await selectRows<CodeRow & { uses: number | string }>(db, `${select} WHERE c.ends_at > ? ORDER BY c.starts_at, c.id`, [toDbTime(now)])),
    ...(await selectRows<CodeRow & { uses: number | string }>(db, `${select} WHERE c.ends_at <= ? ORDER BY c.ends_at DESC, c.id DESC LIMIT 50`, [toDbTime(now)])),
  ];
  return rows.map((r) => {
    const startsAt = fromDbTime(r.starts_at), endsAt = fromDbTime(r.ends_at);
    const state = endsAt.getTime() <= now.getTime() ? "ended" : startsAt.getTime() > now.getTime() ? "upcoming" : "running";
    return {
      id: String(r.id), code: r.code, percentBp: Number(r.percent_bp), minSubtotalCents: Number(r.min_subtotal_cents), maxUses: r.max_uses === null ? null : Number(r.max_uses),
      uses: Number(r.uses), startsAt, endsAt, createdAt: fromDbTime(r.created_at), createdBy: r.created_by, stoppedAt: r.stopped_at ? fromDbTime(r.stopped_at) : null, state,
    };
  });
}
