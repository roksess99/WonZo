// The mails about an admin's own account (D-07, docs/MAIL.md): the
// invitation, and the notice that a recovery code was used
// (.claude/rules/beveiliging.md § Authenticatie, herstelcodes). Dutch only, like the panel.
// Pure: the worker passes the link and the facts.

import type { AdminMessages } from "@/lib/admin/messages";
import type { Role } from "@/lib/admin/permissions";
import { interpolate } from "@/lib/text";
import { block, companyLines, layout, textLayout, type RenderedMail } from "./layout";
import { escapeHtml } from "./style";

const when = (d: Date) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

const footer = (m: AdminMessages["mail"]) => ({ details: companyLines(m), why: m.accountWhy });

export function adminInvite(a: { name: string; role: Role }, inviteUrl: string, expiresAt: Date, logoUrl: string, am: AdminMessages): RenderedMail {
  const m = am.mail;
  const intro = interpolate(m.inviteIntro, { name: a.name, role: am.roles[a.role].toLowerCase() });
  const valid = interpolate(m.inviteValid, { date: when(expiresAt) });
  return {
    subject: m.inviteSubject,
    html: layout({
      lang: "nl",
      title: m.inviteSubject,
      preheader: m.invitePreheader,
      logoUrl,
      footer: footer(m),
      body: [block.h1(m.inviteTitle), block.p(escapeHtml(intro)), block.p(escapeHtml(m.inviteSteps)), block.button(inviteUrl, m.inviteButton), block.p(escapeHtml(valid)), block.p(escapeHtml(m.inviteIgnore))].join("\n"),
    }),
    text: textLayout([m.inviteTitle, "", intro, "", m.inviteSteps, "", `${m.inviteButton}: ${inviteUrl}`, "", valid, m.inviteIgnore], footer(m)),
  };
}

export function adminRecoveryUsed(a: { name: string; at: Date; left: number }, accountUrl: string, logoUrl: string, am: AdminMessages): RenderedMail {
  const m = am.mail;
  const intro = interpolate(m.recoveryIntro, { name: a.name, date: when(a.at), left: String(a.left) });
  const preheader = interpolate(m.recoveryPreheader, { left: String(a.left) });
  return {
    subject: m.recoverySubject,
    html: layout({
      lang: "nl",
      title: m.recoverySubject,
      preheader,
      logoUrl,
      footer: footer(m),
      body: [block.h1(m.recoveryTitle), block.p(escapeHtml(intro)), block.p(escapeHtml(m.recoveryYou)), block.p(escapeHtml(m.recoveryNotYou)), block.button(accountUrl, m.recoveryButton)].join("\n"),
    }),
    text: textLayout([m.recoveryTitle, "", intro, "", m.recoveryYou, m.recoveryNotYou, "", `${m.recoveryButton}: ${accountUrl}`], footer(m)),
  };
}
