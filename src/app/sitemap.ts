import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getCatalogOrUnavailable } from "@/lib/catalog/provider";
import { siteUrl } from "@/lib/seo";
import { sitemapEntries } from "@/lib/sitemap";

/**
 * /sitemap.xml. Per request, never at build time: the products are those of
 * now (the build has no catalogue, and the copy changes every night, D-31).
 * Without a catalogue (the supplier unavailable) the pages and categories are
 * still listed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const [nl, en] = await Promise.all([getCatalogOrUnavailable("nl"), getCatalogOrUnavailable("en")]);
  return sitemapEntries(siteUrl, { nl: nl ?? [], en: en ?? [] });
}
