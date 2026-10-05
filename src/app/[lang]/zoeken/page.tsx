import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CategoryTiles } from "@/components/catalog/CategoryTiles";
import { Listing } from "@/components/catalog/Listing";
import { ProductGridSkeleton } from "@/components/catalog/ProductGrid";
import { SearchForm } from "@/components/layout/Header";
import { Container, StateMessage } from "@/components/ui";
import { getCatalogOrUnavailable } from "@/lib/catalog/provider";
import { parseListingQuery, search, type ListingQuery } from "@/lib/catalog/query";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getMessages, t, type Messages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/zoeken">) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const m = getMessages(lang);
  // Search results are not for indexing; the page itself has a canonical.
  return { ...pageMetadata(lang, { nl: "/zoeken", en: "/en/search" }, m.search.title, m.meta.description), robots: { index: false } };
}

async function Results({ locale, m, query }: { locale: Locale; m: Messages; query: ListingQuery & { q: string } }) {
  const catalog = await getCatalogOrUnavailable(locale);
  if (!catalog) return <StateMessage tone="warning" title={m.listing.unavailableTitle} text={m.listing.unavailableText} />;
  const hits = search(catalog, query.q);
  if (hits.length === 0) {
    return (
      <StateMessage title={t(m.search.emptyTitle, { q: query.q })} text={m.search.emptyText}>
        <CategoryTiles locale={locale} m={m} />
      </StateMessage>
    );
  }
  return <Listing locale={locale} m={m} path={localizePath(locale, "/zoeken")} products={hits} query={query} emptyBaseText={m.search.emptyText} />;
}

export default async function SearchPage({ params, searchParams }: PageProps<"/[lang]/zoeken">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const m = getMessages(lang);
  const query = parseListingQuery(await searchParams);
  return (
    <Container className="flex flex-col gap-6 py-8">
      <h1 className="font-display text-h1 font-bold">{query.q ? t(m.search.resultsFor, { q: query.q }) : m.search.title}</h1>
      <div className="max-w-2xl">
        <SearchForm locale={lang} m={m} big defaultValue={query.q} />
      </div>
      {query.q ? (
        <Suspense key={query.q} fallback={<ProductGridSkeleton label={m.loading} />}>
          <Results locale={lang} m={m} query={{ ...query, q: query.q }} />
        </Suspense>
      ) : (
        <StateMessage title={m.search.noQueryTitle} text={m.search.noQueryText}>
          <CategoryTiles locale={lang} m={m} />
        </StateMessage>
      )}
    </Container>
  );
}
