import type { MetadataRoute } from "next";

// Crawlers stay out of the admin panel and the API (D-07): noindex keeps the
// panel out of an index, this keeps crawlers from the door. Both, on purpose.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/beheer", "/api/"] }] };
}
