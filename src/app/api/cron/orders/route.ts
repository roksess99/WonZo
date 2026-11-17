// POST /api/cron/orders — the scheduled work on orders, every few minutes:
// releasing orders after the 30-minute window, purchasing them at the
// supplier (D-04, src/lib/orders/purchasing.ts) and following the parcels
// (src/lib/orders/tracking.ts), cancelling unpaid orders
// after 60 minutes, reconciliation with the payment provider
// (docs/PAYMENTS.md § Reconciliatie), sending the mail in the outbox
// (src/lib/mail/worker.ts), and tidying the rate limit and the admin
// sessions past their time (.claude/rules/beveiliging.md § Sessies). Bearer
// JOB_TOKEN; one run at a time (GET_LOCK), so two calls never work double
// (.claude/rules/beveiliging.md § Geplande taken).

import { getPool, hasDatabase } from "@/lib/db";
import { pruneRateLimits } from "@/lib/db/rate-limit";
import { pruneAdminSessions } from "@/lib/admin/auth";
import { json, refuseJob } from "@/lib/http";
import { defaultOrdering } from "@/lib/catalog/ordering";
import { releaseClosedWindows } from "@/lib/orders";
import { runPurchasing } from "@/lib/orders/purchasing";
import { runTracking } from "@/lib/orders/tracking";
import { runInvoicing } from "@/lib/invoices";
import { settleReturns } from "@/lib/returns";
import { runReviewInvites } from "@/lib/reviews";
import { defaultMail } from "@/lib/mail";
import { sendDueMail } from "@/lib/mail/worker";
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
      // Purchasing at the supplier (D-04); with SUPPLIER_ORDERING off only the drafts.
      const purchasing = await runPurchasing(defaultOrdering(), now);
      // Where the parcels are: shipped, delivered (D-09: the withdrawal window runs from the delivery).
      const tracked = await runTracking(defaultOrdering(), now);
      // Invitations to review, 7 days after the delivery (D-12); sent below with the other mail.
      const invites = await runReviewInvites(now);
      // Returns whose refund the provider settled: refunded (mail, credit note) or back to the admin (D-09).
      const returns = await settleReturns(now);
      // Invoices for what was released, credit notes for what was cancelled after invoicing or returned (D-21, D-09).
      const invoicing = await runInvoicing(now);
      const expired = provider ? await expireUnpaidOrders(provider, now) : { cancelled: [] };
      const reconciled = provider ? await reconcile(provider, now) : { payments: 0, refunds: 0 };
      // Last: the mail of everything above (confirmations, alerts) goes out in the same run.
      // A wrong mail setting must not stop purchasing and reconciliation: the dashboard shows it.
      let mail: ReturnType<typeof defaultMail> = null;
      try {
        mail = defaultMail();
      } catch {
        console.error("[cron/orders] mail: bad config");
      }
      const mailed = await sendDueMail(mail?.sender ?? null, mail?.config ?? null, now);
      const pruned = await pruneRateLimits(now);
      const sessionsPruned = await pruneAdminSessions(now);
      return json(200, {
        status: "done",
        released: released.released.length,
        purchaseDrafts: purchasing.drafts,
        purchased: purchasing.outcomes.filter((o) => o === "placed").length,
        shipped: tracked.shipped,
        delivered: tracked.delivered,
        invoices: invoicing.invoices,
        creditNotes: invoicing.credits,
        returnsRefunded: returns.refunded,
        reviewInvites: invites,
        cancelled: expired.cancelled.length,
        ...reconciled,
        mailSent: mailed.sent,
        mailFailed: mailed.failed,
        pruned,
        sessionsPruned,
      });
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
