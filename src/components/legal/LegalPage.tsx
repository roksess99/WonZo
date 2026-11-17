import { Container } from "@/components/ui";
import { company } from "@/lib/company";
import type { Locale } from "@/lib/i18n/config";
import { getLegal, LEGAL_UPDATED, type LegalSection } from "@/lib/i18n/legal";
import { interpolate } from "@/lib/text";
import { PrintButton } from "./PrintButton";

/** The company details the legal texts name, from the one place they are kept (src/lib/company.ts). */
export function legalValues(locale: Locale): Record<string, string> {
  const missing = getLegal(locale).open;
  return {
    legalName: company.legalName,
    address: company.address ?? missing,
    kvk: company.kvk,
    vat: company.vat ?? missing,
    email: company.email,
  };
}

/**
 * A paragraph with its values filled in. "{open}" marks what is not decided
 * yet (e.g. D-24): it shows as such, in the warning colour, never as an
 * invented value.
 */
export function LegalParagraph({ text, locale }: { text: string; locale: Locale }) {
  const parts = text.split("{open}");
  const values = legalValues(locale);
  return (
    <p>
      {parts.map((part, i) => (
        <span key={i}>
          {interpolate(part, values)}
          {i < parts.length - 1 ? <span className="font-medium text-warning">{getLegal(locale).open}</span> : null}
        </span>
      ))}
    </p>
  );
}

/** Terms or privacy statement: title, date, the decisive language, numbered sections, and a way to print. */
export function LegalPage({ locale, title, intro, sections }: { locale: Locale; title: string; intro: string; sections: LegalSection[] }) {
  const l = getLegal(locale);
  const date = new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(LEGAL_UPDATED);
  return (
    <Container className="flex max-w-3xl flex-col gap-8 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h1 font-bold">{title}</h1>
        <p className="text-body-sm text-muted">{interpolate(l.updated, { date })}</p>
        <LegalParagraph text={intro} locale={locale} />
        <p className="text-body-sm text-muted">{l.decisive}</p>
        <PrintButton label={l.print} />
      </div>
      {sections.map((s, i) => (
        <section key={i} aria-labelledby={`legal-${i}`} className="flex flex-col gap-2">
          <h2 id={`legal-${i}`} className="font-display text-h2">
            {s.title}
          </h2>
          {s.body.map((p, j) => (
            <LegalParagraph key={j} text={p} locale={locale} />
          ))}
        </section>
      ))}
    </Container>
  );
}
