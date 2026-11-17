import { notFound } from "next/navigation";
import { LegalPage } from "@/components/legal/LegalPage";
import { isLocale } from "@/lib/i18n/config";
import { getLegal } from "@/lib/i18n/legal";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/algemene-voorwaarden">) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getLegal(lang).terms;
  return pageMetadata(lang, { nl: "/algemene-voorwaarden", en: "/en/terms" }, t.metaTitle, t.metaDescription);
}

/** The terms and conditions (docs/SCHERMEN.md § Statische pagina's: reachable before checking out). */
export default async function TermsPage({ params }: PageProps<"/[lang]/algemene-voorwaarden">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getLegal(lang).terms;
  return <LegalPage locale={lang} title={t.title} intro={t.intro} sections={t.sections} />;
}
