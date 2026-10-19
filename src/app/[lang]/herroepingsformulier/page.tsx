import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalParagraph, legalValues } from "@/components/legal/LegalPage";
import { PrintButton } from "@/components/legal/PrintButton";
import { Container } from "@/components/ui";
import { isLocale } from "@/lib/i18n/config";
import { getLegal } from "@/lib/i18n/legal";
import { localizePath } from "@/lib/i18n/paths";
import { pageMetadata } from "@/lib/seo";
import { interpolate } from "@/lib/text";

export async function generateMetadata({ params }: PageProps<"/[lang]/herroepingsformulier">) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getLegal(lang).withdrawal;
  return pageMetadata(lang, { nl: "/herroepingsformulier", en: "/en/withdrawal-form" }, t.metaTitle, t.metaDescription);
}

/**
 * The model withdrawal form (`WETTELIJK`: Richtlijn 2011/83/EU bijlage I-B,
 * BW 6:230o — must be available; the customer may use it, the return form,
 * or a statement of their own). Filled in with the shop's details and
 * printable; the lines to fill in are left empty on purpose.
 */
export default async function WithdrawalFormPage({ params }: PageProps<"/[lang]/herroepingsformulier">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const l = getLegal(lang);
  const t = l.withdrawal;
  return (
    <Container className="flex max-w-3xl flex-col gap-8 py-10">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-h1 font-bold">{t.title}</h1>
        <LegalParagraph text={t.intro} locale={lang} />
        <p className="flex flex-wrap gap-4 print:hidden">
          <Link href={localizePath(lang, "/retour")} className="font-medium underline decoration-2 underline-offset-4">
            {t.onlineLink}
          </Link>
        </p>
        <PrintButton label={l.print} />
      </div>
      <section aria-labelledby="form" className="flex flex-col gap-4 rounded-md bg-surface p-6 ring-1 ring-line print:ring-0">
        <h2 id="form" className="font-display text-h2">
          {t.formTitle}
        </h2>
        <p className="text-body-sm text-muted">{t.formNote}</p>
        <p>{interpolate(t.to, legalValues(lang))}</p>
        <ul className="flex flex-col gap-6">
          {t.lines.map((line, i) => (
            <li key={i} className="flex flex-col gap-2">
              <span>— {line}</span>
              {/* Room to write on paper: a line, not a form field (nothing is sent from here). */}
              <span aria-hidden="true" className="block h-6 border-b border-border" />
            </li>
          ))}
        </ul>
        <p className="text-body-sm text-muted">{t.footnote}</p>
      </section>
    </Container>
  );
}
