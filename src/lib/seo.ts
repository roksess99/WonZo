// Metadata on every route: title, description, canonical and language
// variants (.claude/rules/frontend.md § SEO).

import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n/config";

/**
 * The public address of the shop, checked when the code loads
 * (.claude/rules/beveiliging.md § Secrets: validate environment variables at
 * start-up). A wrong value otherwise surfaced as a bare "Invalid URL" deep in
 * the build (GEMETEN 2026-10-06: "wonzo.nl" without https://), and a missing
 * one would put localhost in every canonical link of the live shop.
 */
export function parseSiteUrl(value: string | undefined, nodeEnv: string | undefined): URL {
  const hint = "NEXT_PUBLIC_SITE_URL must be a full address with https://, such as https://wonzo.nl";
  if (!value) {
    if (nodeEnv === "production") throw new Error(`${hint} (it is not set). Locally: copy it from .env.example.`);
    return new URL("http://localhost:3000");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${hint} (got ${JSON.stringify(value)}).`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`${hint} (got ${JSON.stringify(value)}).`);
  if (url.pathname !== "/" || url.search || url.hash) throw new Error(`${hint}, without a path (got ${JSON.stringify(value)}).`);
  return url;
}

export const siteUrl = parseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL, process.env.NODE_ENV);

/** `paths`: the public path of this page in each language. */
export function pageMetadata(locale: Locale, paths: Record<Locale, string>, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: paths[locale],
      languages: { nl: paths.nl, en: paths.en, "x-default": paths.nl },
    },
    openGraph: { title, description, locale: locale === "nl" ? "nl_NL" : "en_GB", type: "website" },
  };
}
