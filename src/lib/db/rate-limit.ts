// A rate limit that holds for every process together: the count lives in the
// database (.claude/rules/beveiliging.md § Webverzoeken), per fixed window.

import { getPool, selectRows, toDbTime } from "./index";

/**
 * Counts one hit for `bucket` in the current window of `windowMs`; false
 * when that makes more than `max`. Atomic: two requests at the same moment
 * both count.
 */
export async function allowHit(bucket: string, max: number, windowMs: number, now: Date = new Date()): Promise<boolean> {
  const start = toDbTime(new Date(Math.floor(now.getTime() / windowMs) * windowMs));
  const key = bucket.slice(0, 80);
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.query("INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE hits = hits + 1", [key, start]);
    const [row] = await selectRows<{ hits: number | string }>(conn, "SELECT hits FROM rate_limits WHERE bucket = ? AND window_start = ?", [key, start]);
    return Number(row?.hits ?? 0) <= max;
  } finally {
    conn.release();
  }
}

/** Windows older than a day are of no use any more: removed by the daily job. */
export async function pruneRateLimits(now: Date = new Date()): Promise<number> {
  const [result] = await getPool().query("DELETE FROM rate_limits WHERE window_start < ?", [toDbTime(new Date(now.getTime() - 24 * 3_600_000))]);
  return (result as { affectedRows: number }).affectedRows;
}
