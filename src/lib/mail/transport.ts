// Sending one mail over SMTP (D-29), with nodemailer. The only file that
// knows it. Server-side only.

import nodemailer from "nodemailer";
import type { MailConfig } from "./config";

if (typeof window !== "undefined") throw new Error("Mail is sent from the server");

export type OutgoingMail = { to: string; subject: string; html: string; text: string; replyTo?: string };

export type SendResult =
  | { kind: "sent"; messageId: string | null }
  /** The server refused this message for good (5xx, e.g. an address that does not exist): trying again does not help. */
  | { kind: "refused"; error: string }
  /** Connection, time-out, login or a temporary 4xx: try again later. */
  | { kind: "failed"; error: string };

export interface MailSender {
  send(mail: OutgoingMail): Promise<SendResult>;
  /** Can we log in at the server at all (for the health check); never throws. */
  verify(): Promise<boolean>;
}

/** What an SMTP error means for trying again. Pure, for the tests. */
export function classify(err: unknown): SendResult {
  const e = err as { responseCode?: unknown; code?: unknown; message?: unknown };
  const code = typeof e.responseCode === "number" ? e.responseCode : null;
  const what = `${typeof e.code === "string" ? e.code : "ERROR"}${code ? ` ${code}` : ""}`;
  // A login failure is a setting, not this message: keep the mail and keep trying (the health check shows it).
  if (code !== null && code >= 500 && code < 600 && e.code !== "EAUTH") return { kind: "refused", error: what };
  return { kind: "failed", error: what };
}

export function smtpSender(config: MailConfig): MailSender {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    // STARTTLS is required on 587: never send the password in the clear.
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return {
    async send(mail) {
      try {
        const info = await transporter.sendMail({ from: config.from, to: mail.to, replyTo: mail.replyTo, subject: mail.subject, html: mail.html, text: mail.text });
        return { kind: "sent", messageId: typeof info.messageId === "string" ? info.messageId.slice(0, 200) : null };
      } catch (err) {
        return classify(err);
      }
    },
    async verify() {
      try {
        return await transporter.verify();
      } catch {
        return false;
      }
    },
  };
}
