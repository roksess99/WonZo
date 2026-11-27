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

/** The picture a shared link shows (og:image). */
export type ShareImage = { url: string; width?: number; height?: number; alt: string };

/**
 * Without a picture of its own a page shares the square mark: every shared
 * link had no picture at all (SEO audit 2026-11-27). Square, so the small
 * card ("summary"); a product photo gets the large one.
 */
export const DEFAULT_SHARE_IMAGE = { url: "/brand/png/wonzo-mark-512px.png", width: 512, height: 512 } as const;

/**
 * A product photo through our own image optimiser (D-31: photos run via our
 * own domain, never straight from the supplier), 1200 px wide for the large
 * card. The same route `next/image` uses on the page.
 */
export function shareImageUrl(src: string): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=1200&q=75`;
}

/**
 * A meta description of at most `max` characters: `lead` (price and delivery)
 * first, because that is what the search result should say, then as much of
 * `text` as fits, cut at a word with an ellipsis. Supplier texts ran to 399
 * characters, and a search engine cuts them where it likes.
 */
export function metaDescription(lead: string, text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const full = clean ? `${lead} ${clean}` : lead;
  if (full.length <= max) return full;
  const room = full.slice(0, max - 1);
  const cut = room.lastIndexOf(" ");
  return `${(cut > lead.length ? room.slice(0, cut) : room).replace(/[\s,.;:·–-]+$/, "")}…`;
}

/** `paths`: the public path of this page in each language. `image`: its own picture for shared links, if it has one. */
export function pageMetadata(locale: Locale, paths: Record<Locale, string>, title: string, description: string, image?: ShareImage): Metadata {
  const picture = image ?? { ...DEFAULT_SHARE_IMAGE, alt: title };
  return {
    title,
    description,
    alternates: {
      canonical: paths[locale],
      languages: { nl: paths.nl, en: paths.en, "x-default": paths.nl },
    },
    openGraph: { title, description, url: paths[locale], locale: locale === "nl" ? "nl_NL" : "en_GB", type: "website", images: [picture] },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: [picture.url] },
  };
}

/**
 * The host a request came in on, when it is the www variant of the shop's
 * own: `www.wonzo.nl` answered with the same pages (200) instead of
 * redirecting (SEO audit 2026-11-27). Pure, for the proxy.
 */
export function isWwwOf(host: string | null, site: URL): boolean {
  const name = host?.split(":")[0]?.toLowerCase();
  return !!name && name === `www.${site.hostname.toLowerCase()}`;
}
