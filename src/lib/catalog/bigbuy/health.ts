// Does the supplier work, and what is on the balance (docs/BEHEER.md §
// Dashboard: "Tegoed bij de leverancier"; § Een werkende sleutel is geen
// werkende kassa). An expired token looks exactly like a category without
// products, so the token's state is read from the calls the catalog sync
// already makes — no extra call for it. The balance costs a call, at most one
// an hour (LIMITS.user). Never throws; nothing here leaves the adapter but
// the canonical Money and dates. Server-side only.

import { fromDbTime, getPool, hasDatabase, selectRows, type Queryable } from "@/lib/db";
import { readCheck, writeCheck } from "@/lib/db/service-checks";
import { fromDecimal, money, type Money } from "@/lib/money";
import { supplierConfig, supplierGet } from "./client";

export type SupplierHealth =
  /** No token: the shop runs on the mock catalog. */
  | { state: "no-key" }
  | { state: "ok"; lastContact: Date }
  /** The last calls were refused (401/403): an expired or revoked token. */
  | { state: "refused"; since: Date }
  /** The last calls got no answer or a server error. */
  | { state: "unreachable"; since: Date }
  /** No call in a long time: the catalog job is not running. */
  | { state: "quiet"; lastContact: Date | null };

/** The catalog refreshes stock every 2 hours (D-31): 6 hours without a call means the job stopped. */
export const QUIET_AFTER_MS = 6 * 3_600_000;

type Call = { status: number | null; at: Date };

/** The token's state from the latest supplier calls, newest first. Pure. */
export function stateFromCalls(calls: Call[], now: Date): Exclude<SupplierHealth, { state: "no-key" }> {
  const latest = calls[0];
  if (!latest || now.getTime() - latest.at.getTime() > QUIET_AFTER_MS) return { state: "quiet", lastContact: latest?.at ?? null };
  const refused = (c: Call) => c.status === 401 || c.status === 403;
  const failed = (c: Call) => c.status === null || c.status >= 500;
  const run = (bad: (c: Call) => boolean) => {
    let i = 0;
    while (i < calls.length && bad(calls[i]!)) i++;
    return i;
  };
  if (refused(latest)) return { state: "refused", since: calls[run(refused) - 1]!.at };
  // One timeout is weather; three in a row is the service.
  const down = run(failed);
  if (down >= 3) return { state: "unreachable", since: calls[down - 1]!.at };
  return { state: "ok", lastContact: latest.at };
}

export async function supplierHealth(now: Date = new Date(), db?: Queryable): Promise<SupplierHealth> {
  if (!supplierConfigOrNull()) return { state: "no-key" };
  if (!hasDatabase) return { state: "quiet", lastContact: null };
  try {
    const rows = await selectRows<{ http_status: number | null; called_at: string }>(
      db ?? getPool(),
      "SELECT http_status, called_at FROM catalog_api_calls ORDER BY id DESC LIMIT 10",
    );
    return stateFromCalls(rows.map((r) => ({ status: r.http_status === null ? null : Number(r.http_status), at: fromDbTime(String(r.called_at)) })), now);
  } catch {
    return { state: "quiet", lastContact: null };
  }
}

function supplierConfigOrNull() {
  try {
    return supplierConfig();
  } catch {
    return null;
  }
}

export type SupplierBalance = { balance: Money; measuredAt: Date } | null;

/** The balance as BigBuy sends it: a string with two decimals ("10000.00", GEMETEN 2026-10-05). */
export function parseBalance(x: unknown): Money | null {
  if (typeof x !== "string") return null;
  try {
    const m = fromDecimal(x);
    return m.amount >= 0 ? m : null;
  } catch {
    return null;
  }
}

const SERVICE = "bigbuy-purse";
const KEEP_MS = 3_600_000;

/** The balance on the supplier's wallet (moneybox, D-04): the last measurement, refreshed at most once an hour. */
export async function supplierBalance(now: Date = new Date()): Promise<SupplierBalance> {
  const config = supplierConfigOrNull();
  if (!config || !hasDatabase) return null;
  const pool = getPool();
  const last = await readCheck(pool, SERVICE).catch(() => null);
  const fromLast = (): SupplierBalance =>
    last?.state === "ok" && typeof last.detail?.cents === "number" ? { balance: money(last.detail.cents), measuredAt: last.checkedAt } : null;
  if (last && now.getTime() - last.checkedAt.getTime() < KEEP_MS) return fromLast();
  const conn = await pool.getConnection().catch(() => null);
  if (!conn) return fromLast();
  try {
    const balance = parseBalance(await supplierGet(conn, config, "user", "/rest/user/purse.json", 15_000));
    if (!balance) {
      await writeCheck(pool, SERVICE, "unreadable", null, now);
      return null;
    }
    await writeCheck(pool, SERVICE, "ok", { cents: balance.amount }, now);
    return { balance, measuredAt: now };
  } catch {
    // The hour's call is used up, or no answer: the last measurement, with its time.
    return fromLast();
  } finally {
    conn.release();
  }
}
