import Link from "next/link";
import { applyQuery, brandFacet, type ListingQuery, type SortOption } from "@/lib/catalog/query";
import type { Product } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n/config";
import { t, type Messages } from "@/lib/i18n/messages";
import { CloseIcon } from "../icons";
import { StateMessage } from "../ui";
import { ProductGrid } from "./ProductGrid";

type Props = {
  locale: Locale;
  m: Messages;
  /** Public path of this page; the filter form submits to it. */
  path: string;
  /** Products before filtering (this category, or the search hits). */
  products: Product[];
  query: ListingQuery;
  /** Text when the unfiltered list itself is empty. */
  emptyBaseText: string;
};

function urlWith(path: string, query: ListingQuery, change: Partial<ListingQuery>): string {
  const q = { ...query, ...change };
  const params = new URLSearchParams();
  if (q.q) params.set("q", q.q);
  for (const b of q.brands ?? []) params.append("brand", b);
  if (q.minPrice !== undefined) params.set("min", String(q.minPrice));
  if (q.maxPrice !== undefined) params.set("max", String(q.maxPrice));
  if (q.sort && q.sort !== "recommended") params.set("sort", q.sort);
  const s = params.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * Filters, sorting and results. A plain GET form: works without JavaScript,
 * and the URL describes the result, so it can be shared and bookmarked.
 */
export function Listing({ locale, m, path, products, query, emptyBaseText }: Props) {
  const results = applyQuery(products, query);
  const brands = brandFacet(products);
  const L = m.listing;

  const chips: { label: string; href: string }[] = [
    ...(query.brands ?? []).map((b) => ({ label: b, href: urlWith(path, query, { brands: query.brands?.filter((x) => x !== b) }) })),
    ...(query.minPrice !== undefined ? [{ label: `${L.priceMin} € ${query.minPrice}`, href: urlWith(path, query, { minPrice: undefined }) }] : []),
    ...(query.maxPrice !== undefined ? [{ label: `${L.priceMax} € ${query.maxPrice}`, href: urlWith(path, query, { maxPrice: undefined }) }] : []),
  ];

  const sorts: [SortOption, string][] = [
    ["recommended", L.sortRecommended],
    ["price-asc", L.sortPriceAsc],
    ["price-desc", L.sortPriceDesc],
    ["newest", L.sortNewest],
  ];

  const form = (id: string) => (
    <form method="get" action={path} className="flex flex-col gap-6" aria-label={L.filters}>
      {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-sort`} className="text-label uppercase">
          {L.sort}
        </label>
        <select
          id={`${id}-sort`}
          name="sort"
          defaultValue={query.sort ?? "recommended"}
          className="min-h-11 rounded-sm border border-border bg-surface px-3 text-foreground"
        >
          {sorts.map(([value, label]) => (
            <option key={value} value={value} className="bg-surface text-foreground">
              {label}
            </option>
          ))}
        </select>
      </div>
      {brands.length > 1 ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-2 text-label uppercase">{L.brand}</legend>
          {brands.map(({ brand, count }) => (
            <label key={brand} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                name="brand"
                value={brand}
                defaultChecked={query.brands?.includes(brand)}
                className="size-5 accent-petrol"
              />
              <span>
                {brand} <span className="text-muted">({count})</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label uppercase">{L.price}</legend>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["min", L.priceMin, query.minPrice],
              ["max", L.priceMax, query.maxPrice],
            ] as const
          ).map(([name, label, value]) => (
            <div key={name} className="flex flex-col gap-1">
              <label htmlFor={`${id}-${name}`} className="text-body-sm">
                {label}
              </label>
              <input
                id={`${id}-${name}`}
                name={name}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                defaultValue={value ?? ""}
                className="min-h-11 w-full rounded-sm border border-border bg-surface px-3 tabular-nums"
              />
            </div>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="min-h-11 rounded-md bg-petrol px-4 font-medium text-on-petrol">
        {L.apply}
      </button>
    </form>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
      {/* Desktop: filters always visible. */}
      <aside className="hidden lg:block">{form("filters-desktop")}</aside>

      <div className="flex flex-col gap-6">
        {/* Mobile: filters in a panel, so the list starts high on the screen. */}
        <details className="rounded-md bg-surface ring-1 ring-line lg:hidden">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 font-medium">{L.filters}</summary>
          <div className="border-t border-line p-4">{form("filters-mobile")}</div>
        </details>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="font-medium" role="status">
            {results.length === 1 ? L.resultsOne : t(L.results, { count: results.length })}
          </p>
          {chips.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="sr-only">{L.activeFilters}:</span>
              {chips.map((c) => (
                <Link
                  key={c.label}
                  href={c.href}
                  aria-label={t(L.removeFilter, { name: c.label })}
                  className="inline-flex min-h-11 items-center gap-1 rounded-pill bg-brand-soft px-3 text-body-sm"
                >
                  {c.label}
                  <CloseIcon className="size-4" />
                </Link>
              ))}
              <Link href={urlWith(path, query, { brands: [], minPrice: undefined, maxPrice: undefined })} className="min-h-11 content-center text-body-sm underline underline-offset-4">
                {L.reset}
              </Link>
            </div>
          ) : null}
        </div>

        {products.length === 0 ? (
          <StateMessage title={L.emptyTitle} text={emptyBaseText} />
        ) : results.length === 0 ? (
          <StateMessage title={L.emptyTitle} text={L.emptyText} action={{ href: urlWith(path, { q: query.q }, {}), label: L.reset }} />
        ) : (
          <ProductGrid products={results} locale={locale} m={m} />
        )}
      </div>
    </div>
  );
}
