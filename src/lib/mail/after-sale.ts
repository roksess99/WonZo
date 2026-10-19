// The mails after the sale (docs/MAIL.md § Per bericht): on its way, and the
// three steps of a return — registered, refused, refunded — plus the owner's
// note of a new return. Pure, like ./messages.ts: the outbox worker loads the
// data, the preview in the panel passes examples.

import type { AdminMessages } from "@/lib/admin/messages";
import { company } from "@/lib/company";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { formatMoney, type Money } from "@/lib/money";
import type { ReturnReason } from "@/lib/returns/amount";
import { interpolate } from "@/lib/text";
import { block, layout, textLayout, type RenderedMail } from "./layout";
import { footerOf, withLink, type Links } from "./messages";
import { escapeHtml } from "./style";

export type ShippedMailData = {
  locale: Locale;
  reference: string;
  lines: { name: string; quantity: number }[];
  parcels: { carrier: string | null; trackingNumber: string }[];
  delivery: { minWorkingDays: number; maxWorkingDays: number };
  /** Needed for the return form; null when the invoice could not be made yet. */
  invoiceNumber: string | null;
};

/** On its way: what, the tracking number, about when (docs/MAIL.md § Verzonden). */
export function orderShipped(o: ShippedMailData, links: Links, all: Messages): RenderedMail {
  const m = all.mail;
  const c = m.shipped;
  const subject = interpolate(c.subject, { reference: o.reference });
  const footer = footerOf(m);
  const parcels = o.parcels.map((p) => (p.carrier ? interpolate(c.tracking, { carrier: p.carrier, number: p.trackingNumber }) : interpolate(c.trackingNoCarrier, { number: p.trackingNumber })));
  const lines = o.lines.map((l) => interpolate(m.line, { quantity: l.quantity, name: l.name }));
  const expected = interpolate(c.expected, { min: o.delivery.minWorkingDays, max: o.delivery.maxWorkingDays });
  const invoice = o.invoiceNumber ? interpolate(c.invoice, { number: o.invoiceNumber }) : null;
  return {
    subject,
    html: layout({
      lang: o.locale,
      title: subject,
      preheader: c.preheader,
      logoUrl: links.logoUrl,
      footer,
      body: [
        block.h1(c.title),
        block.p(escapeHtml(interpolate(c.intro, { reference: o.reference }))),
        ...(parcels.length ? [block.h2(c.trackingTitle), block.p(parcels.map(escapeHtml).join("<br>"))] : []),
        block.h2(c.linesTitle),
        block.p(lines.map(escapeHtml).join("<br>")),
        block.p(escapeHtml(expected)),
        block.button(links.statusUrl, m.statusLink),
        ...(invoice ? [block.p(escapeHtml(invoice))] : []),
        block.p(withLink(m.returnLink, links.returnUrl)),
      ].join("\n"),
    }),
    text: textLayout(
      [
        c.title,
        "",
        interpolate(c.intro, { reference: o.reference }),
        ...(parcels.length ? ["", c.trackingTitle, ...parcels] : []),
        "",
        c.linesTitle,
        ...lines,
        "",
        expected,
        interpolate(m.statusText, { url: links.statusUrl }),
        ...(invoice ? ["", invoice] : []),
        interpolate(m.returnLink, { url: links.returnUrl }),
      ],
      footer,
    ),
  };
}

export type ReturnMailData = {
  locale: Locale;
  reference: string;
  number: string;
  lines: { name: string; sku: string; quantity: number; reason: ReturnReason }[];
  max: Money;
  refund: Money | null;
  deductionReason: string | null;
  rejectReason: string | null;
};

const returnLines = (r: ReturnMailData, all: Messages) => r.lines.map((l) => `${interpolate(all.mail.line, { quantity: l.quantity, name: l.name })} — ${all.returns.reasons[l.reason]}`);

/** Registered: what goes back, how to send it, the address, at most how much (docs/RETOUREN.md § Wat de klant ziet). */
export function returnRequested(r: ReturnMailData, links: Links, all: Messages): RenderedMail {
  const m = all.mail;
  const c = m.returnRequested;
  const subject = interpolate(c.subject, { number: r.number });
  const footer = footerOf(m);
  const intro = interpolate(c.intro, { number: r.number, reference: r.reference });
  const steps = [all.returns.step1, all.returns.step2, all.returns.step3];
  const address = [`${company.tradeName} (${company.legalName})`, company.address ?? ""].filter(Boolean);
  const amount = interpolate(c.amount, { amount: formatMoney(r.max) });
  const questions = interpolate(m.questions, { email: links.email });
  return {
    subject,
    html: layout({
      lang: r.locale,
      title: subject,
      preheader: c.preheader,
      logoUrl: links.logoUrl,
      footer,
      body: [
        block.h1(c.title),
        block.p(escapeHtml(intro)),
        block.h2(c.linesTitle),
        block.p(returnLines(r, all).map(escapeHtml).join("<br>")),
        block.h2(c.stepsTitle),
        block.p(steps.map((s, i) => `${i + 1}. ${escapeHtml(s)}`).join("<br>")),
        block.h2(c.addressTitle),
        block.p(address.map(escapeHtml).join("<br>")),
        block.p(escapeHtml(amount)),
        block.button(links.statusUrl, m.statusLink),
        block.p(escapeHtml(questions)),
      ].join("\n"),
    }),
    text: textLayout(
      [c.title, "", intro, "", c.linesTitle, ...returnLines(r, all), "", c.stepsTitle, ...steps.map((s, i) => `${i + 1}. ${s}`), "", c.addressTitle, ...address, "", amount, interpolate(m.statusText, { url: links.statusUrl }), questions],
      footer,
    ),
  };
}

/** Not approved: with the admin's reason, and where to go if the customer disagrees. */
export function returnRejected(r: ReturnMailData, links: Links, all: Messages): RenderedMail {
  const m = all.mail;
  const c = m.returnRejected;
  const subject = interpolate(c.subject, { number: r.number });
  const footer = footerOf(m);
  const intro = interpolate(c.intro, { number: r.number, reference: r.reference });
  const reason = interpolate(c.reason, { reason: r.rejectReason ?? "" });
  const next = interpolate(c.next, { email: links.email });
  return {
    subject,
    html: layout({ lang: r.locale, title: subject, preheader: c.preheader, logoUrl: links.logoUrl, footer, body: [block.h1(c.title), block.p(escapeHtml(intro)), block.p(escapeHtml(reason)), block.p(escapeHtml(next))].join("\n") }),
    text: textLayout([c.title, "", intro, reason, "", next], footer),
  };
}

/** Refunded: the amount, the return number, back to how they paid, a few working days (docs/MAIL.md § Retour terugbetaald). */
export function returnRefunded(r: ReturnMailData, links: Links, all: Messages): RenderedMail {
  const m = all.mail;
  const c = m.returnRefunded;
  const refund = r.refund ?? r.max;
  const subject = interpolate(c.subject, { number: r.number });
  const footer = footerOf(m);
  const intro = interpolate(c.intro, { number: r.number, reference: r.reference, amount: formatMoney(refund) });
  const deduction = r.deductionReason && refund.amount < r.max.amount ? interpolate(c.deduction, { max: formatMoney(r.max), reason: r.deductionReason }) : null;
  const questions = interpolate(m.questions, { email: links.email });
  return {
    subject,
    html: layout({
      lang: r.locale,
      title: subject,
      preheader: interpolate(c.preheader, { amount: formatMoney(refund) }),
      logoUrl: links.logoUrl,
      footer,
      body: [block.h1(c.title), block.p(escapeHtml(intro)), ...(deduction ? [block.p(escapeHtml(deduction))] : []), block.button(links.statusUrl, m.statusLink), block.p(escapeHtml(questions))].join("\n"),
    }),
    text: textLayout([c.title, "", intro, ...(deduction ? [deduction] : []), "", interpolate(m.statusText, { url: links.statusUrl }), questions], footer),
  };
}

/** For the owner: short — which return, how much at most, the link (docs/MAIL.md § De mail aan de beheerder). */
export function adminNewReturn(r: ReturnMailData, adminUrl: string, logoUrl: string, am: AdminMessages): RenderedMail {
  const m = am.mail;
  const total = formatMoney(r.max);
  const count = r.lines.reduce((n, l) => n + l.quantity, 0);
  const subject = interpolate(m.newReturnSubject, { number: r.number, reference: r.reference });
  const footer = footerOf(m);
  const intro = interpolate(m.newReturnIntro, { reference: r.reference, total });
  const rows = r.lines.map((l) => ({ left: interpolate(m.newReturnLine, { quantity: l.quantity, sku: l.sku }), sub: interpolate(m.newReturnLineSub, { name: l.name, reason: am.returns.reasons[l.reason] }), right: "" }));
  return {
    subject,
    html: layout({
      lang: "nl",
      title: subject,
      preheader: interpolate(m.newReturnPreheader, { count, total }),
      logoUrl,
      footer,
      body: [block.h1(interpolate(m.newReturnTitle, { number: r.number })), block.p(escapeHtml(intro)), block.rows(rows), block.button(adminUrl, m.openReturn)].join("\n"),
    }),
    text: textLayout(
      [interpolate(m.newReturnTitle, { number: r.number }), "", intro, "", ...rows.map((x) => `${x.left} — ${x.sub}`), "", `${m.openReturn}: ${adminUrl}`],
      footer,
    ),
  };
}

/**
 * The invitation to review (D-12, owner 2026-10-15): once per order, 7 days
 * after the delivery, with the way to opt out in the mail itself — it may
 * count as advertising (`WETTELIJK`, to be confirmed by an adviser).
 */
export function reviewInvite(o: { locale: Locale; reference: string }, reviewUrl: string, links: Links, all: Messages): RenderedMail {
  const m = all.mail;
  const c = m.reviewInvite;
  const subject = interpolate(c.subject, { reference: o.reference });
  const footer = footerOf(m);
  const intro = interpolate(c.intro, { reference: o.reference });
  return {
    subject,
    html: layout({
      lang: o.locale,
      title: subject,
      preheader: c.preheader,
      logoUrl: links.logoUrl,
      footer,
      body: [block.h1(c.title), block.p(escapeHtml(intro)), block.button(reviewUrl, c.button), block.p(escapeHtml(c.once)), block.p(withLink(c.optOut, reviewUrl))].join("\n"),
    }),
    text: textLayout([c.title, "", intro, "", interpolate(c.text, { url: reviewUrl }), "", c.once, interpolate(c.optOut, { url: reviewUrl })], footer),
  };
}
