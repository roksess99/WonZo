// Where mail goes out (D-29: the mail of the hosting, Hostinger, over SMTP).
// Checked when it is first used: a wrong setting stops the sending, loudly,
// instead of mail that quietly does not arrive (docs/MAIL.md). Server-side only.

import { company } from "@/lib/company";

export type MailConfig = {
  host: string;
  port: number;
  /** Port 465 speaks TLS from the first byte; 587 starts plain and upgrades (STARTTLS). */
  secure: boolean;
  user: string;
  password: string;
  /** "WonZo <info@wonzo.nl>": always an address on the shop's own domain (docs/MAIL.md § Aankomen). */
  from: string;
  /** Where the order notifications and alerts for the owner go. */
  ordersTo: string;
  /**
   * Outside production every mail goes here instead of to the customer
   * (docs/MAIL.md § Tijdens het ontwikkelen). Not set outside production:
   * nothing is sent, the mail waits in the outbox.
   */
  redirectTo: string | null;
  production: boolean;
};

const ADDRESS = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/;

/** The bare address of "Name <a@b.nl>" or "a@b.nl". */
export function bareAddress(x: string): string | null {
  const m = /<([^>]+)>\s*$/.exec(x);
  const a = (m ? m[1]! : x).trim();
  return ADDRESS.test(a) ? a : null;
}

/** null: no SMTP_HOST, mail is not set up (nothing is sent, the outbox keeps it). */
export function parseMailConfig(env: Record<string, string | undefined>): MailConfig | null {
  const get = (k: string) => (env[k] ?? "").trim();
  const host = get("SMTP_HOST");
  if (!host) return null;
  const port = Number(get("SMTP_PORT") || "465");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT is not a port number.");
  const from = get("MAIL_FROM");
  const fromAddress = bareAddress(from);
  if (!fromAddress) throw new Error('MAIL_FROM must be an address, e.g. "WonZo <info@wonzo.nl>".');
  if (!fromAddress.toLowerCase().endsWith(`@${company.domain}`)) throw new Error(`MAIL_FROM must be an address on ${company.domain} (docs/MAIL.md § Aankomen).`);
  const ordersTo = get("MAIL_ORDERS_TO");
  if (!bareAddress(ordersTo)) throw new Error("MAIL_ORDERS_TO must be an address: the order notifications go there.");
  const redirect = get("MAIL_REDIRECT_TO");
  if (redirect && !bareAddress(redirect)) throw new Error("MAIL_REDIRECT_TO is not an address.");
  if (!get("SMTP_USER") || !(env.SMTP_PASSWORD ?? "")) throw new Error("SMTP_USER and SMTP_PASSWORD are needed with SMTP_HOST.");
  return {
    host,
    port,
    secure: port === 465,
    user: get("SMTP_USER"),
    // Not trimmed: a space can be part of a password.
    password: env.SMTP_PASSWORD ?? "",
    from,
    ordersTo,
    redirectTo: redirect || null,
    production: env.NODE_ENV === "production",
  };
}

/**
 * Who actually gets a mail meant for `intended`. Production: them. Anywhere
 * else: the test address, or nobody (null: keep it in the outbox) — a mail to
 * a real customer from a development machine is the mistake to rule out.
 */
export function recipient(config: MailConfig, intended: string): string | null {
  if (config.production) return intended;
  return config.redirectTo;
}
