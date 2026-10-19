import { notFound } from "next/navigation";
import { LegalPage } from "@/components/legal/LegalPage";
import { isLocale } from "@/lib/i18n/config";
import { getLegal } from "@/lib/i18n/legal";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/privacy">) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getLegal(lang).privacy;
  return pageMetadata(lang, { nl: "/privacy", en: "/en/privacy" }, t.metaTitle, t.metaDescription);
}

/** The privacy statement: kept in line with docs/PRIVACY.md (§ Bijwerken: same PR, new date). */
export default async function PrivacyPage({ params }: PageProps<"/[lang]/privacy">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getLegal(lang).privacy;
  return <LegalPage locale={lang} title={t.title} intro={t.intro} sections={t.sections} />;
}
