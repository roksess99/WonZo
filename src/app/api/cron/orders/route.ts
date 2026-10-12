// POST /api/cron/orders — the scheduled work on orders, every few minutes:
// purchasing after the 30-minute window (D-04), cancelling unpaid orders
// after 60 minutes, reconciliation with the payment provider
// (docs/PAYMENTS.md § Reconciliatie) and tidying the rate limit. Bearer
// JOB_TOKEN; one run at a time (GET_LOCK), so two calls never work double
// (.claude/rules/beveiliging.md § Geplande taken).

import { getPool, hasDatabase } from "@/lib/db";
import { pruneRateLimits } from "@/lib/db/rate-limit";
import { json, refuseJob } from "@/lib/http";
import { releaseClosedWindows } from "@/lib/orders";
import { expireUnpaidOrders, reconcile } from "@/lib/payments";
import { defaultProvider } from "@/lib/payments/mollie";

export async function POST(request: Request): Promise<Response> {
  const refused = refuseJob(request);
  if (refused) return refused;
  if (!hasDatabase) return json(200, { status: "not-configured" });

  const lock = await getPool().getConnection();
  try {
    // GEMETEN 2026-10-06/08: the server closes a connection idle for 20 s; the lock must outlive the run.
    await lock.query("SET SESSION wait_timeout = 600");
    const [rows] = await lock.query("SELECT GET_LOCK('wonzo_orders_job', 0) AS got");
    if (Number((rows as { got: number | null }[])[0]?.got) !== 1) return json(200, { status: "busy" });
    try {
      const now = new Date();
      const provider = defaultProvider();
      const released = await releaseClosedWindows(now);
      const expired = provider ? await expireUnpaidOrders(provider, now) : { cancelled: [] };
      const reconciled = provider ? await reconcile(provider, now) : { payments: 0, refunds: 0 };
      const pruned = await pruneRateLimits(now);
      return json(200, { status: "done", released: released.released.length, cancelled: expired.cancelled.length, ...reconciled, pruned });
    } finally {
      await lock.query("SELECT RELEASE_LOCK('wonzo_orders_job')");
    }
  } catch (err) {
    console.error("[cron/orders]", err instanceof Error ? err.name : "unknown");
    const code = (err as { code?: unknown }).code;
    return json(500, { status: "error", error: typeof code === "string" ? code : err instanceof Error ? err.name : "unknown" });
  } finally {
    lock.release();
  }
}
