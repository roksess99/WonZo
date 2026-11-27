import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CategoryTiles, categoryCovers } from "@/components/catalog/CategoryTiles";
import { ProductGrid, ProductGridSkeleton } from "@/components/catalog/ProductGrid";
import { Hero, PanelSkeleton, ShowcasePanel } from "@/components/home/Hero";
import { Container, StateMessage } from "@/components/ui";
import { applyQuery } from "@/lib/catalog/query";
import { getCatalogOrUnavailable } from "@/lib/catalog/provider";
import { heroShowcase } from "@/lib/catalog/showcase";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { pageMetadata, siteUrl } from "@/lib/seo";
import { jsonLd, websiteJsonLd } from "@/lib/structured-data";

export async function generateMetadata({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const m = getMessages(lang);
  return pageMetadata(lang, { nl: "/", en: "/en" }, `${m.meta.siteName} — ${m.home.title}`, m.meta.description);
}

async function AlwaysAvailable({ locale, m }: { locale: Locale; m: Messages }) {
  // Per request, never prerendered: prices, stock and promotions of now (D-08).
  await connection();
  const catalog = await getCatalogOrUnavailable(locale);
  if (!catalog) return <StateMessage tone="warning" title={m.listing.unavailableTitle} text={m.listing.unavailableText} />;
  // Not the products the hero already shows: the same three twice reads as a mistake.
  const inHero = new Set(heroShowcase(catalog).products.map((p) => `${p.source}:${p.id}`));
  const rest = applyQuery(catalog, { sort: "recommended" }).filter((p) => !inHero.has(`${p.source}:${p.id}`));
  return <ProductGrid products={rest.slice(0, 8)} locale={locale} m={m} />;
}

/**
 * The tiles with a real product photo per category. The catalogue comes later
 * than the page: until then (and when it is unavailable) the tiles show their
 * drawings, in the same size, so nothing jumps.
 */
async function TilesWithPhotos({ locale, m }: { locale: Locale; m: Messages }) {
  const catalog = await getCatalogOrUnavailable(locale);
  return <CategoryTiles locale={locale} m={m} covers={catalog ? categoryCovers(catalog) : {}} />;
}

/** The hero's products (src/components/home/Hero.tsx): per request, like the grid below. Without a catalogue: nothing, the hero stays. */
async function HeroProducts({ locale, m }: { locale: Locale; m: Messages }) {
  await connection();
  const catalog = await getCatalogOrUnavailable(locale);
  return catalog ? <ShowcasePanel showcase={heroShowcase(catalog)} locale={locale} m={m} /> : null;
}

/** Home: one task — bring the visitor to the product (docs/SCHERMEN.md § Home). */
export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const m = getMessages(lang);
  const homePath = localizePath(lang, "/");
  return (
    <>
      {/* The site itself, per language; our own texts, "<" escaped (src/lib/structured-data.ts). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(websiteJsonLd(siteUrl, homePath, m.meta.siteName, m.meta.description, lang === "nl" ? "nl-NL" : "en-GB")) }}
      />
      <Hero
        locale={lang}
        m={m}
        panel={
          <Suspense fallback={<PanelSkeleton label={m.loading} />}>
            <HeroProducts locale={lang} m={m} />
          </Suspense>
        }
      />
      <Container className="flex flex-col gap-12 py-10">
        <section aria-labelledby="home-categories" className="flex flex-col gap-4">
          <h2 id="home-categories" className="font-display text-h2">
            {m.home.categoriesTitle}
          </h2>
          <Suspense fallback={<CategoryTiles locale={lang} m={m} />}>
            <TilesWithPhotos locale={lang} m={m} />
          </Suspense>
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
