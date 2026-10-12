// Carrying out the mail in the outbox (docs/MAIL.md § Als het misgaat,
// docs/IDEMPOTENCY.md § Mail): at least once, on purpose — a record is marked
// SENT only after the server took it, so a crash in between gives one double
// mail, never a customer without a confirmation. A temporary failure waits
// longer each time; after MAX_ATTEMPTS, or a refusal for good, it is FAILED
// and on the dashboard. Runs inside the orders job (one at a time, GET_LOCK).
// Server-side only.

import { adminMessages } from "@/lib/admin/messages";
import { statusPath } from "@/lib/checkout";
import { company } from "@/lib/company";
import { getPool, selectRows, toDbTime, withTransaction } from "@/lib/db";
import { getMessages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { add, money } from "@/lib/money";
import { issueAccessToken } from "@/lib/orders/store";
import { readOrderView } from "@/lib/orders/view";
import { siteUrl } from "@/lib/seo";
import { bareAddress, recipient, type MailConfig } from "./config";
import { adminAlert, adminNewOrder, alertKind, orderCancelled, orderConfirmation, type Links } from "./messages";
import type { MailSender, OutgoingMail } from "./transport";

export const MAIL_KINDS = ["order-confirmation", "admin-new-order", "order-cancelled", "admin-alert"] as const;
/** Minutes to wait after the n-th failure: quick at first (a hiccup), then hours (a server that is down). */
const BACKOFF_MINUTES = [1, 5, 15, 60, 180, 360, 720];
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;

export const backoffMs = (attempts: number) => BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1]! * 60_000;

const url = (path: string) => new URL(path, siteUrl).toString();
const LOGO = "/brand/png/wonzo-wordmark-1744px.png";

type Composed = { kind: "mail"; intended: string; mail: Omit<OutgoingMail, "to"> } | { kind: "skip"; reason: string };

type Row = { id: number | string; kind: string; dedupe_key: string; payload: unknown; attempts: number | string };

/** What a record becomes, read from the frozen order at the moment of sending. */
async function compose(row: Row, config: MailConfig, now: Date): Promise<Composed> {
  const payload = (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as { orderId?: unknown; reason?: unknown; error?: unknown } | null;
  const orderId = Number(payload?.orderId);
  const order = Number.isSafeInteger(orderId) ? await readOrderView(getPool(), orderId, now) : null;
  if (!order) return { kind: "skip", reason: "bestelling niet gevonden" };
  const adminUrl = url(`/beheer/bestellingen/${orderId}`);
  const customerLinks = async (): Promise<Links> => {
    // A key of its own for every message (docs/DATAMODEL.md § Order: toegangssleutels).
    const token = await withTransaction((conn) => issueAccessToken(conn, orderId, now));
    return { statusUrl: url(statusPath(order.locale, token)), contactUrl: url(localizePath(order.locale, "/contact")), logoUrl: url(LOGO), email: company.email };
  };
  switch (row.kind) {
    case "order-confirmation":
      if (!order.paidAt) return { kind: "skip", reason: "niet betaald" };
      return { kind: "mail", intended: order.customer.email, mail: orderConfirmation(order, await customerLinks(), getMessages(order.locale)) };
    case "order-cancelled": {
      // An unpaid order that simply expired gets no mail: the customer stopped before paying.
      if (!order.paidAt) return { kind: "skip", reason: "niet betaald: geen mail bij een verlopen bestelling" };
      const refund = order.refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => add(s, r.amount), money(0));
      return { kind: "mail", intended: order.customer.email, mail: orderCancelled({ locale: order.locale, reference: order.reference, refund }, await customerLinks(), getMessages(order.locale)) };
    }
    case "admin-new-order":
      return { kind: "mail", intended: config.ordersTo, mail: adminNewOrder(order, adminUrl, url(LOGO), adminMessages()) };
    case "admin-alert": {
      const detail = { reason: typeof payload?.reason === "string" ? payload.reason : undefined, error: typeof payload?.error === "string" ? payload.error : undefined };
      return { kind: "mail", intended: config.ordersTo, mail: adminAlert({ reference: order.reference, kind: alertKind(row.dedupe_key), detail, paid: order.paidAt !== null }, adminUrl, url(LOGO), adminMessages()) };
    }
    default:
      return { kind: "skip", reason: `geen mail voor ${row.kind}` };
  }
}

export type MailRun = { sent: number; failed: number; skipped: number; held: number };

/**
 * One round: every mail record that is due. Without a mail setup, or outside
 * production without MAIL_REDIRECT_TO, nothing goes out and nothing is lost:
 * the records wait.
 */
export async function sendDueMail(sender: MailSender | null, config: MailConfig | null, now: Date = new Date(), limit = 50): Promise<MailRun> {
  const run: MailRun = { sent: 0, failed: 0, skipped: 0, held: 0 };
  if (!sender || !config) return run;
  // Outside production without a test address nobody may get mail: stop before anything is composed
  // (composing a customer mail issues a key for the status link).
  if (!config.production && !config.redirectTo) return run;
  const marks = MAIL_KINDS.map(() => "?").join(", ");
  const due = await selectRows<Row>(
    getPool(),
    `SELECT id, kind, dedupe_key, payload, attempts FROM outbox WHERE kind IN (${marks}) AND status = 'PENDING' AND next_attempt_at <= ? ORDER BY id LIMIT ?`,
    [...MAIL_KINDS, toDbTime(now), limit],
  );
  for (const row of due) {
    const composed = await compose(row, config, now);
    if (composed.kind === "skip") {
      await getPool().query("UPDATE outbox SET status = 'DONE', last_error = ? WHERE id = ? AND status = 'PENDING'", [composed.reason.slice(0, 500), row.id]);
      run.skipped++;
      continue;
    }
    const to = bareAddress(composed.intended) ? recipient(config, composed.intended) : null;
    if (!to) {
      run.held++;
      continue;
    }
    const result = await sender.send({ ...composed.mail, to, replyTo: company.email });
    if (result.kind === "sent") {
      await getPool().query("UPDATE outbox SET status = 'SENT', sent_at = ?, message_id = ?, last_error = NULL WHERE id = ?", [toDbTime(now), result.messageId, row.id]);
      run.sent++;
    } else {
      const attempts = Number(row.attempts) + 1;
      const final = result.kind === "refused" || attempts >= MAX_ATTEMPTS;
      await getPool().query("UPDATE outbox SET attempts = ?, last_error = ?, status = ?, next_attempt_at = ? WHERE id = ?", [
        attempts,
        result.error.slice(0, 500),
        final ? "FAILED" : "PENDING",
        toDbTime(final ? now : new Date(now.getTime() + backoffMs(attempts))),
        row.id,
      ]);
      run.failed++;
    }
  }
  return run;
}
