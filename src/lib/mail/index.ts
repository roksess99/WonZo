// The shop's mail from the environment, and whether it works — not whether
// a setting is filled in (docs/BEHEER.md § Een werkende sleutel is geen
// werkende kassa). Server-side only.

import { getPool, hasDatabase } from "@/lib/db";
import { readCheck, writeCheck } from "@/lib/db/service-checks";
import { parseMailConfig, type MailConfig } from "./config";
import { smtpSender, type MailSender } from "./transport";

let setup: { config: MailConfig; sender: MailSender } | null | undefined;

/** The configured mail; null without SMTP_HOST. A wrong setting throws: loud, not quietly no mail. */
export function defaultMail(): { config: MailConfig; sender: MailSender } | null {
  if (setup === undefined) {
    const config = parseMailConfig(process.env);
    setup = config ? { config, sender: smtpSender(config) } : null;
  }
  return setup;
}

export type MailHealth =
  | { state: "not-configured" }
  | { state: "bad-config" }
  /** Outside production without MAIL_REDIRECT_TO: nothing goes out, the outbox keeps it. */
  | { state: "held" }
  /** Outside production: everything to the test address. */
  | { state: "redirect"; to: string }
  /** The server does not let us log in (or is not there). */
  | { state: "login-failed" }
  | { state: "ok" };

const SERVICE = "smtp";
const KEEP_MS = 5 * 60_000;

export async function mailHealth(now: Date = new Date()): Promise<MailHealth> {
  let mail: ReturnType<typeof defaultMail>;
  try {
    mail = defaultMail();
  } catch {
    return { state: "bad-config" };
  }
  if (!mail) return { state: "not-configured" };
  if (!mail.config.production && !mail.config.redirectTo) return { state: "held" };
  const last = hasDatabase ? await readCheck(getPool(), SERVICE).catch(() => null) : null;
  let works: boolean;
  if (last && now.getTime() - last.checkedAt.getTime() < KEEP_MS) works = last.state === "ok";
  else {
    works = await mail.sender.verify();
    if (hasDatabase) await writeCheck(getPool(), SERVICE, works ? "ok" : "login-failed", null, now).catch(() => {});
  }
  if (!works) return { state: "login-failed" };
  return mail.config.production ? { state: "ok" } : { state: "redirect", to: mail.config.redirectTo! };
}
