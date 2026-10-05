// The same page in the other language, for the language switch and hreflang.
// Static words come from paths.ts, category slugs from the assortment; a
// product keeps its id and the product page redirects to the right slug.

import { assortment } from "@/lib/catalog/assortment";
import type { Locale } from "./config";
import { localizePath, resolvePublicPath, staticSegments } from "./paths";

export function alternatePath(publicPath: string, to: Locale): string {
  const resolved = resolvePublicPath(publicPath);
  if (resolved.kind === "redirect") return alternatePath(resolved.to, to);
  const [, from, ...rest] = resolved.internalPath.split("/");
  const fromLocale = from as Locale;
  if (rest[0] && !(rest[0] in staticSegments)) {
    const category = assortment.find((c) => c.slug[fromLocale] === rest[0]);
    if (category) {
      rest[0] = category.slug[to];
      if (rest[1]) {
        const sub = category.subcategories.find((s) => s.slug[fromLocale] === rest[1]);
        if (sub) rest[1] = sub.slug[to];
      }
    }
  }
  return localizePath(to, "/" + rest.join("/"));
}
