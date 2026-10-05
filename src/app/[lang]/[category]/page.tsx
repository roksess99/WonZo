import { notFound } from "next/navigation";
import { CategoryPage } from "@/components/catalog/CategoryPage";
import { findCategoryBySlug } from "@/lib/catalog/assortment";
import { parseListingQuery } from "@/lib/catalog/query";
import { isLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/[category]">) {
  const { lang, category: slug } = await params;
  if (!isLocale(lang)) return {};
  const category = findCategoryBySlug(lang, slug);
  if (!category) return {};
  const m = getMessages(lang);
  const c = m.categories[category.key as keyof typeof m.categories];
  return pageMetadata(lang, { nl: localizePath("nl", `/${category.slug.nl}`), en: localizePath("en", `/${category.slug.en}`) }, c.name, c.intro);
}

export default async function Page({ params, searchParams }: PageProps<"/[lang]/[category]">) {
  const { lang, category: slug } = await params;
  if (!isLocale(lang)) notFound();
  // Validated before anything streams: an unknown slug is a real 404.
  const category = findCategoryBySlug(lang, slug);
  if (!category) notFound();
  return <CategoryPage locale={lang} m={getMessages(lang)} category={category} query={parseListingQuery(await searchParams)} />;
}
