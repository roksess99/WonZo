import Link from "next/link";
import { ProductTextForm } from "@/components/admin/ProductTextForm";
import { requirePage } from "@/lib/admin/access";
import { adminMessages } from "@/lib/admin/messages";
import { getCatalog, getProduct } from "@/lib/catalog/provider";
import { search } from "@/lib/catalog/query";
import { INTRO_MAX, isProductId, loadProductTexts, productsWithText, type ProductTexts } from "@/lib/catalog/texts";
import type { Product } from "@/lib/catalog/types";
import { getPool, hasDatabase } from "@/lib/db";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { interpolate } from "@/lib/text";

export async function generateMetadata() {
  await requirePage("productteksten");
  return { title: adminMessages().texts.title };
}

const LIST_MAX = 100;
const FILTERS = ["alle", "zonder", "met"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * The shop's own introduction per product (user 2026-11-27): a list to find
 * the product, then one form with both languages. Owner only for now
 * (src/lib/admin/permissions.ts).
 */
export default async function ProductTextsPage({ searchParams }: PageProps<"/beheer/productteksten">) {
  await requirePage("productteksten");
  const am = adminMessages();
  const m = am.texts;
  const sp = await searchParams;
  const productId = typeof sp.artikel === "string" && isProductId(sp.artikel) ? sp.artikel : null;

  const loadError = (
    <>
      <h1 className="font-display text-h1 font-bold">{m.title}</h1>
      <p role="alert" className="font-medium text-danger">
        {am.dashboard.loadError}
      </p>
    </>
  );
  if (!hasDatabase) return loadError;

  if (productId) {
    let loaded: { nl: Product; en: Product | null; texts: ProductTexts } | null | "missing" = null;
    try {
      const nl = await getProduct("nl", productId);
      loaded = nl ? { nl, en: await getProduct("en", productId), texts: await loadProductTexts(getPool(), nl.source, nl.id) } : "missing";
    } catch (err) {
      console.error("[beheer/productteksten]", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown"));
    }
    if (!loaded) return loadError;
    return (
      <>
        <p>
          <Link href="/beheer/productteksten" className="inline-flex min-h-11 items-center underline underline-offset-4">
            {m.back}
          </Link>
        </p>
        {loaded === "missing" ? (
          <p role="alert" className="font-medium text-danger">
            {m.notFound}
          </p>
        ) : (
          <>
            <h1 className="font-display text-h1 font-bold">{interpolate(m.editTitle, { name: loaded.nl.name })}</h1>
            <p className="text-body-sm text-muted tabular-nums">
              {loaded.nl.sku} ·{" "}
              <a href={localizePath("nl", `/product/${loaded.nl.slug}`)} className="underline underline-offset-4">
                {m.viewShop}
              </a>
            </p>
            <section aria-label={m.title} className="rounded-md bg-surface p-6 ring-1 ring-line">
              <ProductTextForm
                productId={loaded.nl.id}
                version={loaded.texts.version}
                nl={loaded.texts.nl}
                en={loaded.texts.en}
                names={{ nl: loaded.nl.name, en: loaded.en?.name ?? loaded.nl.name }}
                max={INTRO_MAX}
                m={m}
                busy={am.actions.busy}
              />
            </section>
            <section aria-labelledby="supplier-text" className="flex flex-col gap-2 rounded-md bg-surface p-6 ring-1 ring-line">
              <h2 id="supplier-text" className="font-display text-h2 font-bold">
                {m.supplierTitle}
              </h2>
              {/* Supplier text as plain text, never as HTML (.claude/rules/beveiliging.md § XSS). */}
              {loaded.nl.description.slice(0, 3).map((para, i) => (
                <p key={i} className="max-w-prose whitespace-pre-line text-body-sm text-muted">
                  {para}
                </p>
              ))}
            </section>
          </>
        )}
      </>
    );
  }

  const query = typeof sp.zoek === "string" ? sp.zoek.slice(0, 100) : "";
  const filter: Filter = typeof sp.toon === "string" && (FILTERS as readonly string[]).includes(sp.toon) ? (sp.toon as Filter) : "alle";
  let data: { catalog: Product[]; withText: Map<string, Locale[]> } | null = null;
  try {
    const [catalog, withText] = await Promise.all([getCatalog("nl"), productsWithText(getPool())]);
    data = { catalog, withText };
  } catch (err) {
    console.error("[beheer/productteksten]", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown"));
  }
  if (!data) return loadError;
  const { catalog, withText } = data;
  // The shop's own search (name, brand, sku); without a query, everything.
  const found = (query.trim() ? search(catalog, query) : catalog).filter((p) => filter === "alle" || (filter === "met") === withText.has(`${p.source}:${p.id}`));

  return (
    <>
      <h1 className="font-display text-h1 font-bold">{m.title}</h1>
      <p className="max-w-prose text-muted">{m.intro}</p>
      {/* A GET form: searching changes nothing, and the address can be shared or reloaded. */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-md bg-surface p-4 ring-1 ring-line">
        <div className="flex flex-col gap-1">
          <label htmlFor="texts-search" className="font-medium">
            {m.searchLabel}
          </label>
          <input
            id="texts-search"
            name="zoek"
            defaultValue={query}
            aria-describedby="texts-search-hint"
            className="min-h-11 rounded-sm border border-border bg-background px-3 text-foreground"
          />
          <span id="texts-search-hint" className="text-body-sm text-muted">
            {m.searchHint}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="texts-filter" className="font-medium">
            {m.filterLabel}
          </label>
          <select id="texts-filter" name="toon" defaultValue={filter} className="min-h-11 rounded-sm border border-border bg-background px-3 text-foreground">
            <option value="alle" className="bg-background text-foreground">{m.filterAll}</option>
            <option value="zonder" className="bg-background text-foreground">{m.filterWithout}</option>
            <option value="met" className="bg-background text-foreground">{m.filterWith}</option>
          </select>
        </div>
        <button type="submit" className="min-h-11 rounded-md bg-petrol px-4 font-medium text-on-petrol">
          {m.search}
        </button>
      </form>
      <p role="status" className="text-body-sm text-muted">
        {interpolate(m.results, { shown: Math.min(found.length, LIST_MAX), count: found.length })}
        {found.length > LIST_MAX ? ` ${m.resultsMore}` : ""}
      </p>
      {found.length ? (
        <div className="overflow-x-auto rounded-md bg-surface ring-1 ring-line">
          <table className="w-full min-w-[32rem]">
            <thead>
              <tr className="border-b border-line text-body-sm text-muted">
                <th scope="col" className="px-4 py-2 text-start font-medium">{m.colProduct}</th>
                <th scope="col" className="px-4 py-2 text-start font-medium">{m.colTexts}</th>
                <th scope="col" className="px-4 py-2 text-end font-medium">
                  <span className="sr-only">{m.edit}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {found.slice(0, LIST_MAX).map((p) => {
                const langs = withText.get(`${p.source}:${p.id}`) ?? [];
                return (
                  <tr key={p.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2">
                      {p.name} <span className="text-body-sm text-muted tabular-nums">{p.sku}</span>
                    </td>
                    <td className="px-4 py-2 text-body-sm">
                      {langs.length ? langs.map((l) => (l === "nl" ? m.hasNl : m.hasEn)).join(" · ") : <span className="text-muted">{m.missing}</span>}
                    </td>
                    <td className="px-4 py-2 text-end">
                      <Link href={`/beheer/productteksten?artikel=${p.id}`} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
                        {m.edit}
                        <span className="sr-only">: {p.name}</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p>{m.none}</p>
      )}
    </>
  );
}
