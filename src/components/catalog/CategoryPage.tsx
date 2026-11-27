import Link from "next/link";
import { Suspense } from "react";
import type { Category, Subcategory } from "@/lib/catalog/assortment";
import { getCatalogOrUnavailable } from "@/lib/catalog/provider";
import type { ListingQuery } from "@/lib/catalog/query";
import type { Locale } from "@/lib/i18n/config";
import { t, type Messages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { formatMoney, formatMoneyShort } from "@/lib/money";
import { shippingPolicy } from "@/lib/pricing/shipping";
import { WITHDRAWAL_DAYS } from "@/lib/returns/amount";
import { siteUrl } from "@/lib/seo";
import { breadcrumbJsonLd, jsonLd } from "@/lib/structured-data";
import { Breadcrumb, Container, StateMessage } from "../ui";
import { Listing } from "./Listing";
import { ProductGridSkeleton } from "./ProductGrid";

type Props = { locale: Locale; m: Messages; category: Category; sub?: Subcategory; query: ListingQuery };

async function Results({ locale, m, category, sub, query, path }: Props & { path: string }) {
  const catalog = await getCatalogOrUnavailable(locale);
  // docs/SUPPLIER_RESILIENCE.md: a broken supplier gives an honest state, never an error page.
  if (!catalog) return <StateMessage tone="warning" title={m.listing.unavailableTitle} text={m.listing.unavailableText} />;
  const products = catalog.filter((p) => p.categoryKey === category.key && (!sub || p.subcategoryKey === sub.key));
  return <Listing locale={locale} m={m} path={path} products={products} query={query} emptyBaseText={m.listing.emptyCategory} />;
}

/** The text under the h1 and in the meta description: a subcategory's own, else its category's. */
export function categoryIntro(m: Messages, category: Category, sub?: Subcategory): string {
  return sub ? m.subcategoryIntros[sub.key as keyof Messages["subcategoryIntros"]] : m.categories[category.key as keyof Messages["categories"]].intro;
}

/** Category and subcategory: choosing without hiding (docs/SCHERMEN.md § Categorie). */
export function CategoryPage({ locale, m, category, sub, query }: Props) {
  const categoryName = m.categories[category.key as keyof Messages["categories"]].name;
  const categoryPath = localizePath(locale, `/${category.slug[locale]}`);
  const path = sub ? `${categoryPath}/${sub.slug[locale]}` : categoryPath;
  const title = sub ? m.subcategories[sub.key as keyof Messages["subcategories"]] : categoryName;
  // One list for the visible breadcrumb and its markup, so they cannot differ.
  const crumbs = [{ href: localizePath(locale, "/"), label: m.meta.siteName }, ...(sub ? [{ href: categoryPath, label: categoryName }] : []), { label: title }];

  return (
    <Container className="flex flex-col gap-6 py-8">
      {/* Our own labels and paths; "<" escaped (src/lib/structured-data.ts). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(crumbs, siteUrl)) }} />
      <Breadcrumb label={m.a11y.breadcrumb} items={crumbs} />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h1 font-bold">{title}</h1>
        {/* Running text under the h1: a page with only a grid has no subject. A subcategory has its own. */}
        <p className="max-w-prose text-muted">{categoryIntro(m, category, sub)}</p>
      </div>
      <nav aria-label={categoryName}>
        <ul className="flex flex-wrap gap-2">
          {[{ key: "", label: m.listing.all, href: categoryPath }, ...category.subcategories.map((s) => ({
            key: s.key,
            label: m.subcategories[s.key as keyof Messages["subcategories"]],
            href: `${categoryPath}/${s.slug[locale]}`,
          }))].map((chip) => {
            const current = (sub?.key ?? "") === chip.key;
            return (
              <li key={chip.key || "all"}>
                <Link
                  href={chip.href}
                  aria-current={current ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-pill px-4 ring-1 ${
                    current ? "bg-petrol text-on-petrol ring-petrol" : "bg-surface ring-line hover:ring-border"
                  }`}
                >
                  {chip.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Suspense fallback={<ProductGridSkeleton label={m.loading} />}>
        <Results locale={locale} m={m} category={category} sub={sub} query={query} path={path} />
      </Suspense>
      {/* Running text at the bottom (docs/SCHERMEN.md § Categorie), with the amounts from the shop's own rules. */}
      <section aria-labelledby="about-buying" className="flex max-w-prose flex-col gap-2 border-t border-line pt-6">
        <h2 id="about-buying" className="font-display text-h2">
          {m.listing.aboutTitle}
        </h2>
        <p className="text-muted">
          {t(m.listing.aboutText, {
            fee: formatMoney(shippingPolicy.fee),
            freeFrom: formatMoneyShort(shippingPolicy.freeFrom),
            days: WITHDRAWAL_DAYS,
          })}
        </p>
      </section>
    </Container>
  );
}
