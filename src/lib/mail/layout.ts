// The wrapper of every mail (docs/MAIL.md § Het omhulsel): an outer table
// with the page colour, a card of fixed width, a header with the logo (PNG,
// with alt text: images are often blocked), the content, and a footer with
// the company details and why this mail came. Tables and inline styles only;
// background and text colour always both (dark mode in mail clients).

import { company } from "@/lib/company";
import { escapeHtml, MAIL } from "./style";

export type RenderedMail = { subject: string; html: string; text: string };

export type Footer = { details: string[]; why: string };

export function layout(input: { lang: "nl" | "en"; title: string; preheader: string; body: string; footer: Footer; logoUrl: string }): string {
  const f = input.footer;
  return `<!doctype html>
<html lang="${input.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${MAIL.background};color:${MAIL.text};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${MAIL.background};">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${MAIL.background};color:${MAIL.text};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${MAIL.width}px;background:${MAIL.surface};color:${MAIL.text};border:1px solid ${MAIL.line};border-radius:8px;">
<tr><td style="padding:24px 24px 8px 24px;">
<img src="${escapeHtml(input.logoUrl)}" width="140" alt="${escapeHtml(company.tradeName)}" style="display:block;border:0;width:140px;height:auto;">
</td></tr>
<tr><td style="padding:8px 24px 24px 24px;font-family:${MAIL.font};font-size:16px;line-height:24px;color:${MAIL.text};">
${input.body}
</td></tr>
<tr><td style="padding:16px 24px 24px 24px;border-top:1px solid ${MAIL.line};font-family:${MAIL.font};font-size:13px;line-height:20px;color:${MAIL.muted};background:${MAIL.surface};">
${f.details.map(escapeHtml).join("<br>")}<br><br>${escapeHtml(f.why)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** The text version: the same facts in the same order (docs/MAIL.md § De tekstversie is geen bijzaak). */
export function textLayout(body: string[], footer: Footer): string {
  return [...body, "", "—", ...footer.details, "", footer.why].join("\n");
}

export function companyLines(labels: { kvk: string; vat: string }): string[] {
  return [
    `${company.tradeName} (${company.legalName})`,
    company.address ?? "",
    company.email,
    labels.kvk.replace("{kvk}", company.kvk),
    company.vat ? labels.vat.replace("{vat}", company.vat) : "",
  ].filter(Boolean);
}

/** A heading, a paragraph, a table of rows: the few blocks the messages are made of. */
export const block = {
  h1: (t: string) => `<h1 style="margin:0 0 12px 0;font-size:24px;line-height:30px;font-weight:bold;color:${MAIL.text};">${escapeHtml(t)}</h1>`,
  h2: (t: string) => `<h2 style="margin:24px 0 8px 0;font-size:18px;line-height:24px;font-weight:bold;color:${MAIL.text};">${escapeHtml(t)}</h2>`,
  p: (html: string) => `<p style="margin:0 0 12px 0;">${html}</p>`,
  /** Rows of [left, right]; the left cell wraps, the right one holds the amount. */
  rows: (rows: { left: string; right: string; bold?: boolean; sub?: string }[]) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows
      .map(
        (r) =>
          `<tr><td style="padding:8px 8px 8px 0;border-bottom:1px solid ${MAIL.line};vertical-align:top;${r.bold ? "font-weight:bold;" : ""}">${escapeHtml(r.left)}${
            r.sub ? `<br><span style="font-size:13px;color:${MAIL.muted};">${escapeHtml(r.sub)}</span>` : ""
          }</td><td width="30%" align="right" style="padding:8px 0;border-bottom:1px solid ${MAIL.line};vertical-align:top;${r.bold ? "font-weight:bold;" : ""}">${escapeHtml(r.right)}</td></tr>`,
      )
      .join("")}</table>`,
  /** A button-like link: a coloured cell, still a plain link when images and styles are off. */
  button: (href: string, label: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;"><tr><td style="background:${MAIL.petrol};border-radius:6px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;color:${MAIL.onPetrol};font-weight:bold;text-decoration:none;font-family:${MAIL.font};">${escapeHtml(label)}</a></td></tr></table>`,
};
