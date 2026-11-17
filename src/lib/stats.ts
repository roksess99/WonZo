// The shop's own statistics (D-10, owner 2026-10-15): page views per page per
// day, counted on our own server — no cookies, nothing on the visitor's
// device, no IP address, no visitor id, no third party (docs/PRIVACY.md).
// Only shop pages are counted; the key in a status link never reaches the
// table (the path is cut off before it). Server-side only.

import { amsterdamYearMonth } from "@/lib/dates";
import { getPool, selectRows, toDbTime, type Queryable } from "@/lib/db";

/** The public paths that carry a secret or a per-customer value: counted without that part. */
const CUT_AFTER = ["/bestelling/", "/en/order/", "/nl/bestelling/", "/en/bestelling/"];
/** Not shop pages: never counted. */
const NEVER = [/^\/beheer(\/|$)/, /^\/api(\/|$)/, /^\/_next(\/|$)/];

/**
 * The path as it is counted, or null when it is not counted. Pure.
 * "/bestelling/<key>" → "/bestelling/…": the key is a password to the order.
 */
export function countedPath(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 300) return null;
  const path = input.split(/[?#]/)[0]!;
  if (!/^\/[A-Za-z0-9\-/._~%]*$/.test(path) || NEVER.some((re) => re.test(path))) return null;
  for (const prefix of CUT_AFTER) if (path.startsWith(prefix)) return `${prefix}…`;
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return clean.slice(0, 200);
}

/** The day in the Netherlands, as YYYY-MM-DD: a view just after midnight counts for the new day here. */
export function amsterdamDay(d: Date): string {
  const { year, month } = amsterdamYearMonth(d);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", day: "2-digit" }).format(d);
  return `${year}-${String(month).padStart(2, "0")}-${day}`;
}

export async function recordView(path: string, now: Date = new Date()): Promise<void> {
  await getPool().query("INSERT INTO page_views (day, path, views) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE views = views + 1", [amsterdamDay(now), path]);
}

export type Funnel = { cart: number; checkout: number; started: number; paid: number };

/**
 * The way to a sale over the last `days` days, from what the shop knows
 * anyway — no tracking of a visitor from step to step: views of the cart and
 * of the checkout (page views, not people), orders with a payment started,
 * and orders paid. A rough picture, and it says so on the screen.
 */
export async function readFunnel(db: Queryable, days: number, now: Date = new Date()): Promise<Funnel> {
  const fromDay = amsterdamDay(new Date(now.getTime() - (days - 1) * 86_400_000));
  const since = toDbTime(new Date(now.getTime() - days * 86_400_000));
  const views = async (paths: string[]) =>
    Number((await selectRows<{ v: number | string | null }>(db, `SELECT SUM(views) AS v FROM page_views WHERE day >= ? AND path IN (${paths.map(() => "?").join(", ")})`, [fromDay, ...paths]))[0]?.v ?? 0);
  const [cart, checkout, started, paid] = await Promise.all([
    views(["/winkelwagen", "/en/cart"]),
    views(["/afrekenen", "/en/checkout"]),
    selectRows<{ n: number | string }>(db, "SELECT COUNT(DISTINCT order_id) AS n FROM payments WHERE created_at >= ?", [since]).then((r) => Number(r[0]?.n ?? 0)),
    selectRows<{ n: number | string }>(db, "SELECT COUNT(*) AS n FROM orders WHERE paid_at >= ?", [since]).then((r) => Number(r[0]?.n ?? 0)),
  ]);
  return { cart, checkout, started, paid };
}

export type StatsOverview = {
  days: { day: string; views: number }[];
  pages: { path: string; views: number }[];
  total: number;
};

/** The last `days` days (Dutch calendar, today included): views per day, and the most viewed pages. */
export async function readStats(db: Queryable, days: number, now: Date = new Date(), top = 25): Promise<StatsOverview> {
  const from = amsterdamDay(new Date(now.getTime() - (days - 1) * 86_400_000));
  const perDay = await selectRows<{ day: string; v: number | string }>(db, "SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, SUM(views) AS v FROM page_views WHERE day >= ? GROUP BY day ORDER BY day", [from]);
  const pages = await selectRows<{ path: string; v: number | string }>(db, "SELECT path, SUM(views) AS v FROM page_views WHERE day >= ? GROUP BY path ORDER BY v DESC, path LIMIT ?", [from, top]);
  // Every day in the range, also the ones without views: a gap is information.
  const counts = new Map(perDay.map((r) => [r.day, Number(r.v)]));
  const list: { day: string; views: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = amsterdamDay(new Date(now.getTime() - i * 86_400_000));
    if (!list.some((x) => x.day === day)) list.push({ day, views: counts.get(day) ?? 0 });
  }
  return { days: list, pages: pages.map((p) => ({ path: p.path, views: Number(p.v) })), total: list.reduce((s, d) => s + d.views, 0) };
}
