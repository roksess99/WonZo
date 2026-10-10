// Numbers without gaps: order numbers, and later invoice and credit-note
// numbers (D-21, docs/FACTUUR.md § Nummering). One row per series and year,
// raised in the same transaction as the document that gets the number: the
// row stays locked until commit, so two documents never get the same
// number, and a rollback gives the number back.

import type { Connection } from "./index";

/**
 * The next number in `series` for `period` (a year), starting at 1. Must run
 * inside the transaction that writes the document.
 */
export async function nextNumber(conn: Connection, series: string, period: number): Promise<number> {
  if (!/^[a-z][a-z0-9-]{0,19}$/.test(series)) throw new Error(`Bad counter series: ${series}`);
  if (!Number.isInteger(period) || period < 2000 || period > 9999) throw new Error(`Bad counter period: ${period}`);
  // LAST_INSERT_ID(expr) hands the new value back on this connection only;
  // the upsert takes the row lock (InnoDB) until the transaction ends.
  await conn.query(
    "INSERT INTO counters (series, period, last_value) VALUES (?, ?, LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE last_value = LAST_INSERT_ID(last_value + 1)",
    [series, period],
  );
  const [rows] = await conn.query("SELECT LAST_INSERT_ID() AS n");
  const n = Number((rows as { n: number | string }[])[0]?.n);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`Counter ${series}/${period} gave no number`);
  return n;
}

/** "WZ-2026-00001" (owner, 2026-10-10): per year, five digits. */
export function orderReference(year: number, n: number): string {
  return `WZ-${year}-${String(n).padStart(5, "0")}`;
}

/** The calendar year in the Netherlands: an order at 00:30 on 1 January belongs to the new year. */
export function amsterdamYear(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "Europe/Amsterdam" }).format(d));
}
