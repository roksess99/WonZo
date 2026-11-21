// /llms.txt: a short map of the shop for language models (llmstxt.org, a
// community proposal). Google says it does not use it; other AI systems may
// (GEO-analyse 2026-11-21). Built from the same company details, shipping
// rule, return window and texts as the site, so it never says something the
// pages do not.

import { assortment } from "@/lib/catalog/assortment";
import { company } from "@/lib/company";
import { locales, type Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { formatMoneyShort } from "@/lib/money";
import { shippingPolicy } from "@/lib/pricing/shipping";
import { WITHDRAWAL_DAYS } from "@/lib/returns/amount";
import { postalAddress } from "@/lib/structured-data";
import { interpolate } from "@/lib/text";

/** The facts every language states the same way. */
export function companyFacts(): Record<string, string | number> {
  return {
    legalName: company.legalName,
    kvk: company.kvk,
    city: postalAddress(company.address)?.addressLocality ?? "",
    fee: formatMoneyShort(shippingPolicy.fee),
    freeFrom: formatMoneyShort(shippingPolicy.freeFrom),
    days: WITHDRAWAL_DAYS,
  };
}

export function llmsText(base: URL, messages: Record<Locale, Messages>): string {
  const abs = (l: Locale, path: string) => new URL(localizePath(l, path), base).toString();
  const nl = messages.nl;
  const lines = [`# ${nl.meta.siteName}`, "", `> ${nl.meta.description}`, "", interpolate(nl.llms.about, companyFacts()), ""];
  for (const l of locales) {
    const m = messages[l];
    const f = m.footer;
    lines.push(`## ${m.llms.pages}`, "");
    lines.push(`- [${m.meta.siteName}](${abs(l, "/")}): ${m.meta.description}`);
    for (const [label, path] of [
      [f.howItWorks, "/zo-werkt-wonzo"],
      [f.returns, "/retour"],
      [f.reviews, "/beoordelingen"],
      [f.contact, "/contact"],
      [f.terms, "/algemene-voorwaarden"],
      [f.privacy, "/privacy"],
    ] as const) {
      lines.push(`- [${label}](${abs(l, path)})`);
    }
    lines.push("", `## ${m.llms.categories}`, "");
    for (const c of assortment) lines.push(`- [${m.categories[c.key as keyof Messages["categories"]].name}](${abs(l, `/${c.slug[l]}`)})`);
    lines.push("");
  }
  lines.push(`${company.tradeName} · ${company.email} · ${new URL("/sitemap.xml", base).toString()}`, "");
  return lines.join("\n");
}
