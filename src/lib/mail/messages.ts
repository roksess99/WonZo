// The messages (docs/MAIL.md § Per bericht): pure functions from the frozen
// order to subject, HTML and text — the same facts in both, in the same
// order. No database here: the outbox worker loads the data, the preview in
// the panel passes examples.

import type { AdminMessages } from "@/lib/admin/messages";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { formatMoney, type Money } from "@/lib/money";
import { MixedVatShipping, vatBreakdown } from "@/lib/pricing/vat";
import { interpolate } from "@/lib/text";
import { block, companyLines, layout, textLayout, type RenderedMail } from "./layout";
import { escapeHtml, link } from "./style";

export type MailLine = { name: string; sku: string; quantity: number; unitPrice: Money; lineTotal: Money; largeShipping: Money | null; vatRateBp: number };

export type OrderMailData = {
  locale: Locale;
  reference: string;
  createdAt: Date;
  lines: MailLine[];
  subtotal: Money;
  shippingStandard: Money;
  shippingLarge: Money;
  total: Money;
  customer: { firstName: string; lastName: string; street: string; houseNumber: string; postcode: string; city: string };
  cancelWindowEndsAt: Date | null;
  delivery: { minWorkingDays: number; maxWorkingDays: number };
};

export type Links = { statusUrl: string; contactUrl: string; logoUrl: string; email: string; /** The return form (D-09). */ returnUrl: string };

const fmt = (locale: Locale, d: Date, withDate: boolean) =>
  new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    timeZone: "Europe/Amsterdam",
    ...(withDate ? { day: "numeric", month: "long", year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

/**
 * The VAT per rate under the total (BW 6:230v: the VAT amount apart), from the
 * same function as the invoice (D-15): mail and invoice never differ a cent.
 * Shipping with two rates is still open in D-15: then only "including VAT".
 */
function vatRows(o: OrderMailData, m: Messages["mail"]): { left: string; right: string }[] {
  try {
    const vat = vatBreakdown(o.lines, { amount: o.shippingStandard.amount + o.shippingLarge.amount, currency: o.total.currency });
    const pct = (bp: number) => `${new Intl.NumberFormat(o.locale === "nl" ? "nl-NL" : "en-GB", { maximumFractionDigits: 2 }).format(bp / 100)}%`;
    return vat.byRate.map((r) => ({ left: interpolate(m.vatLine, { rate: pct(r.vatRateBp) }), right: formatMoney(r.vat) }));
  } catch (err) {
    if (err instanceof MixedVatShipping) return [];
    throw err;
  }
}

/** The order table and the amounts, as rows for HTML and lines for text. */
function amounts(o: OrderMailData, m: Messages["mail"]) {
  const rows = o.lines.map((l) => ({
    left: interpolate(m.line, { quantity: l.quantity, name: l.name }),
    sub: interpolate(m.lineSub, { price: formatMoney(l.unitPrice), sku: l.sku }),
    right: formatMoney(l.lineTotal),
  }));
  const totals = [
    { left: m.subtotal, right: formatMoney(o.subtotal) },
    { left: m.shipping, right: o.shippingStandard.amount === 0 ? m.shippingFree : formatMoney(o.shippingStandard) },
    ...(o.shippingLarge.amount > 0 ? [{ left: m.shippingLarge, right: formatMoney(o.shippingLarge) }] : []),
    { left: m.total, right: formatMoney(o.total), bold: true },
    ...vatRows(o, m),
  ];
  const text = [
    ...o.lines.map((l) => `${interpolate(m.line, { quantity: l.quantity, name: l.name })} — ${formatMoney(l.lineTotal)} (${interpolate(m.lineSub, { price: formatMoney(l.unitPrice), sku: l.sku })})`),
    "",
    ...totals.map((t) => `${t.left}: ${t.right}`),
  ];
  return { rows, totals, text };
}

/** A text with "{url}" in it, as HTML with that place a real link. */
export function withLink(template: string, url: string): string {
  const [before = "", after = ""] = template.split("{url}");
  return `${escapeHtml(before)}${link(url, url)}${escapeHtml(after)}`;
}

export const footerOf = (m: { why: string; kvk: string; vat: string }) => ({ details: companyLines(m), why: m.why });

/** The confirmation (docs/MAIL.md, `WETTELIJK` BW 6:230v): on its own it has to be right, not only behind a link. */
export function orderConfirmation(o: OrderMailData, links: Links, all: Messages): RenderedMail {
  const m = all.mail;
  const c = m.confirmation;
  const a = amounts(o, m);
  const address = [`${o.customer.firstName} ${o.customer.lastName}`, `${o.customer.street} ${o.customer.houseNumber}`, `${o.customer.postcode} ${o.customer.city}`];
  const next = interpolate(c.next, {
    time: o.cancelWindowEndsAt ? fmt(o.locale, o.cancelWindowEndsAt, false) : "—",
    min: o.delivery.minWorkingDays,
    max: o.delivery.maxWorkingDays,
  });
  const withdrawal = interpolate(c.withdrawal, { email: links.email });
  const subject = interpolate(c.subject, { reference: o.reference });
  const footer = footerOf(m);
  const html = layout({
    lang: o.locale,
    title: subject,
    preheader: interpolate(c.preheader, { total: formatMoney(o.total) }),
    logoUrl: links.logoUrl,
    footer,
    body: [
      block.h1(c.title),
      block.p(escapeHtml(c.intro)),
      block.p(`<strong>${escapeHtml(interpolate(c.orderLine, { reference: o.reference, date: fmt(o.locale, o.createdAt, true) }))}</strong>`),
      block.h2(c.linesTitle),
      block.rows(a.rows),
      block.rows(a.totals),
      block.p(`<span style="font-size:13px;">${escapeHtml(m.inclVat)}</span>`),
      block.h2(c.addressTitle),
      block.p(address.map(escapeHtml).join("<br>")),
      block.h2(c.nextTitle),
      block.p(escapeHtml(next)),
      block.button(links.statusUrl, m.statusLink),
      block.h2(c.withdrawalTitle),
      block.p(escapeHtml(withdrawal)),
      block.p(withLink(c.withdrawalMore, links.returnUrl)),
    ].join("\n"),
  });
  const text = textLayout(
    [
      c.title,
      "",
      c.intro,
      interpolate(c.orderLine, { reference: o.reference, date: fmt(o.locale, o.createdAt, true) }),
      "",
      c.linesTitle,
      ...a.text,
      m.inclVat,
      "",
      c.addressTitle,
      ...address,
      "",
      c.nextTitle,
      next,
      interpolate(m.statusText, { url: links.statusUrl }),
      "",
      c.withdrawalTitle,
      withdrawal,
      interpolate(c.withdrawalMore, { url: links.returnUrl }),
    ],
    footer,
  );
  return { subject, html, text };
}

/** Cancelled, with what is paid back (docs/MAIL.md § Retour terugbetaald: the amount, back to how it was paid, a few working days). */
export function orderCancelled(o: { locale: Locale; reference: string; refund: Money }, links: Links, all: Messages): RenderedMail {
  const m = all.mail;
  const c = m.cancelled;
  const subject = interpolate(c.subject, { reference: o.reference });
  const footer = footerOf(m);
  const refund = interpolate(c.refund, { amount: formatMoney(o.refund) });
  const questions = interpolate(c.questions, { email: links.email });
  return {
    subject,
    html: layout({
      lang: o.locale,
      title: subject,
      preheader: interpolate(c.preheader, { amount: formatMoney(o.refund) }),
      logoUrl: links.logoUrl,
      footer,
      body: [block.h1(c.title), block.p(escapeHtml(interpolate(c.intro, { reference: o.reference }))), block.p(escapeHtml(refund)), block.button(links.statusUrl, m.statusLink), block.p(escapeHtml(questions))].join("\n"),
    }),
    text: textLayout([c.title, "", interpolate(c.intro, { reference: o.reference }), refund, "", interpolate(m.statusText, { url: links.statusUrl }), questions], footer),
  };
}

/** For the owner, on a phone: short, not a copy of the customer's mail (docs/MAIL.md § De mail aan de beheerder). */
export function adminNewOrder(o: Pick<OrderMailData, "reference" | "lines" | "total">, adminUrl: string, logoUrl: string, am: AdminMessages): RenderedMail {
  const m = am.mail;
  const total = formatMoney(o.total);
  const count = o.lines.reduce((n, l) => n + l.quantity, 0);
  const subject = interpolate(m.newOrderSubject, { reference: o.reference, total });
  const footer = footerOf(m);
  const rows = o.lines.map((l) => ({ left: interpolate(m.newOrderLine, { quantity: l.quantity, sku: l.sku }), sub: interpolate(m.newOrderLineSub, { name: l.name }), right: formatMoney(l.lineTotal) }));
  const intro = interpolate(m.newOrderIntro, { total });
  return {
    subject,
    html: layout({
      lang: "nl",
      title: subject,
      preheader: interpolate(m.newOrderPreheader, { count, total }),
      logoUrl,
      footer,
      body: [block.h1(interpolate(m.newOrderTitle, { reference: o.reference })), block.p(escapeHtml(intro)), block.rows(rows), block.button(adminUrl, m.open)].join("\n"),
    }),
    text: textLayout(
      [interpolate(m.newOrderTitle, { reference: o.reference }), "", intro, "", ...o.lines.map((l) => `${interpolate(m.newOrderLine, { quantity: l.quantity, sku: l.sku })} — ${formatMoney(l.lineTotal)} — ${l.name}`), "", `${m.open}: ${adminUrl}`],
      footer,
    ),
  };
}

export type AlertWhat = keyof AdminMessages["mail"]["alertWhat"];

/** What an alert in the outbox is about, from its key (src/lib/orders, src/lib/payments). */
export function alertKind(dedupeKey: string): AlertWhat {
  if (/^order:\d+:hold:/.test(dedupeKey)) return "hold";
  if (dedupeKey.startsWith("payment:")) return "payment";
  if (/^refund:.+:failed$/.test(dedupeKey)) return "refundFailed";
  if (/^supplier:.+:failed$/.test(dedupeKey)) return "supplierFailed";
  if (/^supplier:.+:gave-up$/.test(dedupeKey)) return "supplierGaveUp";
  if (/^supplier:.+:price:/.test(dedupeKey)) return "supplierPrice";
  if (/^supplier:.+:unknown$/.test(dedupeKey)) return "supplierUnknown";
  return "other";
}

/** The alert that a person has to act on: which order, what is wrong, whether the customer paid, and the link. */
export function adminAlert(a: { reference: string; kind: AlertWhat; detail: { reason?: string; error?: string }; paid: boolean }, adminUrl: string, logoUrl: string, am: AdminMessages): RenderedMail {
  const m = am.mail;
  const what = interpolate(m.alertWhat[a.kind], { reason: a.detail.reason ?? "", error: a.detail.error ?? "" });
  const subject = interpolate(m.alertSubject, { reference: a.reference, what });
  const intro = interpolate(m.alertIntro, { reference: a.reference, what });
  const paid = a.paid ? m.alertPaid : m.alertNotPaid;
  const footer = footerOf(m);
  return {
    subject,
    html: layout({ lang: "nl", title: subject, preheader: intro, logoUrl, footer, body: [block.h1(m.alertTitle), block.p(escapeHtml(intro)), block.p(escapeHtml(paid)), block.button(adminUrl, m.open)].join("\n") }),
    text: textLayout([m.alertTitle, "", intro, paid, "", `${m.open}: ${adminUrl}`], footer),
  };
}
