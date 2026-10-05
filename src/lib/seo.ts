// Metadata on every route: title, description, canonical and language
// variants (.claude/rules/frontend.md § SEO).

import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n/config";

export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");

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
