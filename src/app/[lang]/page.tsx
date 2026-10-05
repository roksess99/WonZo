import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CategoryTiles } from "@/components/catalog/CategoryTiles";
import { ProductGrid, ProductGridSkeleton } from "@/components/catalog/ProductGrid";
import { Container, StateMessage } from "@/components/ui";
import { applyQuery } from "@/lib/catalog/query";
import { getCatalogOrUnavailable } from "@/lib/catalog/provider";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const m = getMessages(lang);
  return pageMetadata(lang, { nl: "/", en: "/en" }, `${m.meta.siteName} — ${m.home.title}`, m.meta.description);
}

async function AlwaysAvailable({ locale, m }: { locale: Locale; m: Messages }) {
  const catalog = await getCatalogOrUnavailable(locale);
  if (!catalog) return <StateMessage tone="warning" title={m.listing.unavailableTitle} text={m.listing.unavailableText} />;
  return <ProductGrid products={applyQuery(catalog, { sort: "recommended" }).slice(0, 8)} locale={locale} m={m} />;
}

/** Home: one task — bring the visitor to the product (docs/SCHERMEN.md § Home). */
export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const m = getMessages(lang);
  return (
    <>
      <section className="bg-brand-soft/60">
        <Container className="flex flex-col gap-6 py-10 sm:py-14">
          <h1 className="max-w-2xl font-display text-h1 font-bold sm:text-display">{m.home.title}</h1>
          <p className="max-w-prose text-body">{m.home.intro}</p>
        </Container>
      </section>
      <Container className="flex flex-col gap-12 py-10">
        <section aria-labelledby="home-categories" className="flex flex-col gap-4">
          <h2 id="home-categories" className="font-display text-h2">
            {m.home.categoriesTitle}
          </h2>
          <CategoryTiles locale={lang} m={m} />
        </section>
        <section aria-labelledby="home-available" className="flex flex-col gap-4">
          <h2 id="home-available" className="font-display text-h2">
            {m.home.popularTitle}
          </h2>
          <Suspense fallback={<ProductGridSkeleton label={m.loading} />}>
            <AlwaysAvailable locale={lang} m={m} />
          </Suspense>
        </section>
      </Container>
    </>
  );
}
