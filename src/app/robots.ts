import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

// Crawlers stay out of the admin panel and the API (D-07): noindex keeps the
// panel out of an index, this keeps crawlers from the door. Both, on purpose.
// Every other crawler, search and AI alike, may read the shop; the sitemap
// says where the pages are (GEO-analyse 2026-11-21).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/beheer", "/api/"] }],
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
  };
}
