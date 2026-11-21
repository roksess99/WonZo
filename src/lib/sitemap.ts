// The sitemap (/sitemap.xml): every page a search engine should find, in both
// languages, each with its language variants — the same pairs the pages
// themselves give as hreflang (src/lib/seo.ts: nl, en, x-default = nl). Pure:
// the route (src/app/sitemap.ts) hands in the catalogue.
//
// Not in it, on purpose: search, cart, checkout, order and review links
// (noindex, and personal), /beheer and /api (robots.txt).

import type { MetadataRoute } from "next";
import { assortment } from "@/lib/catalog/assortment";
import type { Product } from "@/lib/catalog/types";
import { locales, type Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";

/** Pages without catalogue data, as internal (Dutch) paths. */
export const SITEMAP_PAGES = ["/", "/zo-werkt-wonzo", "/contact", "/beoordelingen", "/retour", "/algemene-voorwaarden", "/privacy", "/herroepingsformulier"] as const;

type Paths = Partial<Record<Locale, string>>;

function entries(base: URL, paths: Paths): MetadataRoute.Sitemap {
  const abs = (p: string) => new URL(p, base).toString();
  const languages: Record<string, string> = {};
  for (const l of locales) if (paths[l]) languages[l] = abs(paths[l]);
  if (paths.nl) languages["x-default"] = abs(paths.nl);
  return locales.filter((l) => paths[l]).map((l) => ({ url: abs(paths[l]!), alternates: { languages } }));
}

/**
 * One entry per page per language. A product's slug differs per language
 * (the name is in the URL); a product that exists in one language only is
 * listed in that one, without a partner.
 */
export function sitemapEntries(base: URL, catalogs: Partial<Record<Locale, Product[]>>): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [];
  for (const page of SITEMAP_PAGES) out.push(...entries(base, { nl: localizePath("nl", page), en: localizePath("en", page) }));
  for (const c of assortment) {
    out.push(...entries(base, { nl: localizePath("nl", `/${c.slug.nl}`), en: localizePath("en", `/${c.slug.en}`) }));
    for (const s of c.subcategories) {
      out.push(...entries(base, { nl: localizePath("nl", `/${c.slug.nl}/${s.slug.nl}`), en: localizePath("en", `/${c.slug.en}/${s.slug.en}`) }));
    }
  }
  const products = new Map<string, Paths>();
  for (const l of locales) {
    for (const p of catalogs[l] ?? []) {
      const key = `${p.source}:${p.id}`;
      products.set(key, { ...products.get(key), [l]: localizePath(l, `/product/${p.slug}`) });
    }
  }
  for (const paths of products.values()) out.push(...entries(base, paths));
  return out;
}
