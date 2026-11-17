// Our selling price per product over time (docs/PRIJZEN.md § 2, "De
// van-prijs"): one row each time it changes, with the rule or promotion that
// gave it. A strike-through price needs the lowest price of the 30 days
// before a promotion starts (WETTELIJK, to be confirmed); a history we do not
// build today, we still lack in thirty days. Run by the scheduled job.

import { getPricedCatalog } from "@/lib/catalog/provider";
import { getPool, selectRows, toDbTime, type Queryable } from "@/lib/db";

type Last = { source: string; product_id: string; price_cents: number | string; list_price_cents: number | string; promotion_id: number | string | null };

/** Writes a row for every product whose price, list price or promotion differs from its last row. Returns how many. */
export async function recordPrices(now: Date, db: Queryable = getPool()): Promise<number> {
  const entries = await getPricedCatalog("nl");
  if (!entries.length) return 0;
  const last = await selectRows<Last>(
    db,
    `SELECT h.source, h.product_id, h.price_cents, h.list_price_cents, h.promotion_id
       FROM price_history h
       JOIN (SELECT source, product_id, MAX(from_at) AS at FROM price_history GROUP BY source, product_id) m
         ON m.source = h.source AND m.product_id = h.product_id AND m.at = h.from_at`,
  );
  const byKey = new Map(last.map((r) => [`${r.source}:${r.product_id}`, r]));
  const rows: unknown[][] = [];
  for (const { product: p, pricing } of entries) {
    const prev = byKey.get(`${p.source}:${p.id}`);
    const promotionId = pricing.promotion?.id ?? null;
    if (prev && Number(prev.price_cents) === p.price.amount && Number(prev.list_price_cents) === pricing.listPrice.amount && (prev.promotion_id === null ? null : String(prev.promotion_id)) === promotionId) continue;
    rows.push([p.source, p.id, toDbTime(now), p.price.amount, pricing.listPrice.amount, p.price.currency, pricing.basis, promotionId]);
  }
  for (let i = 0; i < rows.length; i += 500) {
    await db.query("INSERT IGNORE INTO price_history (source, product_id, from_at, price_cents, list_price_cents, currency, basis, promotion_id) VALUES ?", [rows.slice(i, i + 500)]);
  }
  return rows.length;
}
