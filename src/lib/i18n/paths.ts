// URL words in the language of the page (D-32). Routes inside `app/[lang]`
// use the Dutch words; the proxy maps the public English words onto them.
// Category slugs are not here: they live with the assortment.

import { defaultLocale, isLocale, type Locale } from "./config";

/** Internal (Dutch) route segment → public segment per language. */
export const staticSegments = {
  zoeken: { nl: "zoeken", en: "search" },
  "zo-werkt-wonzo": { nl: "zo-werkt-wonzo", en: "how-wonzo-works" },
  contact: { nl: "contact", en: "contact" },
  product: { nl: "product", en: "product" },
} as const satisfies Record<string, Record<Locale, string>>;

export type StaticSegment = keyof typeof staticSegments;

/** Public path for an internal path, e.g. ("en", "/zoeken") → "/en/search". */
export function localizePath(locale: Locale, internalPath: string): string {
  const [first = "", ...rest] = internalPath.replace(/^\/+/, "").split("/");
  const mapped = first in staticSegments ? staticSegments[first as StaticSegment][locale] : first;
  const path = [mapped, ...rest].filter(Boolean).join("/");
  if (locale === defaultLocale) return `/${path}`;
  return path ? `/${locale}/${path}` : `/${locale}`;
}

export type ResolvedPath =
  | { kind: "rewrite"; locale: Locale; internalPath: string }
  | { kind: "redirect"; to: string };

/**
 * Maps a public path to the internal route (`/<lang>/<dutch words>`), or to a
 * redirect when the URL is not the canonical one (e.g. `/nl/...`).
 */
export function resolvePublicPath(pathname: string): ResolvedPath {
  const parts = pathname.split("/").filter(Boolean);
  const head = parts[0];

  if (head === defaultLocale) {
    // "/nl/tuin" is not a public URL: Dutch has no prefix.
    return { kind: "redirect", to: "/" + parts.slice(1).join("/") };
  }

  if (head && isLocale(head)) {
    const [first, ...rest] = parts.slice(1);
    let internalFirst = first;
    if (first !== undefined) {
      const hit = (Object.keys(staticSegments) as StaticSegment[]).find((k) => staticSegments[k][head] === first);
      if (hit) internalFirst = hit;
    }
    const internal = [internalFirst, ...rest].filter((p) => p !== undefined).join("/");
    return { kind: "rewrite", locale: head, internalPath: `/${head}${internal ? `/${internal}` : ""}` };
  }

  return { kind: "rewrite", locale: defaultLocale, internalPath: `/${defaultLocale}${pathname === "/" ? "" : pathname}` };
}
