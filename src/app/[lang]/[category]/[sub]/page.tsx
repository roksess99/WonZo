import { notFound } from "next/navigation";
import { CategoryPage, categoryIntro } from "@/components/catalog/CategoryPage";
import { findCategoryBySlug, findSubcategoryBySlug } from "@/lib/catalog/assortment";
import { parseListingQuery } from "@/lib/catalog/query";
import { isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/[category]/[sub]">) {
  const { lang, category: cslug, sub: sslug } = await params;
  if (!isLocale(lang)) return {};
  const category = findCategoryBySlug(lang, cslug);
  const sub = category && findSubcategoryBySlug(category, lang, sslug);
  if (!category || !sub) return {};
  const m = getMessages(lang);
  return pageMetadata(
    lang,
    {
      nl: localizePath("nl", `/${category.slug.nl}/${sub.slug.nl}`),
      en: localizePath("en", `/${category.slug.en}/${sub.slug.en}`),
    },
    m.subcategories[sub.key as keyof typeof m.subcategories],
    // Its own description: the four subcategories of Wonen all had that of /wonen (SEO audit 2026-11-27).
    categoryIntro(m, category, sub),
  );
}

export default async function Page({ params, searchParams }: PageProps<"/[lang]/[category]/[sub]">) {
  const { lang, category: cslug, sub: sslug } = await params;
  if (!isLocale(lang)) notFound();
  const category = findCategoryBySlug(lang, cslug);
  const sub = category && findSubcategoryBySlug(category, lang, sslug);
  if (!category || !sub) notFound();
  return <CategoryPage locale={lang} m={getMessages(lang)} category={category} sub={sub} query={parseListingQuery(await searchParams)} />;
}
