// Language routing (D-32): Dutch without a prefix, English under /en with
// English words. Public URLs are rewritten onto the internal routes in
// app/[lang]/ (Dutch words); "/nl/..." is not a public URL and redirects.

import { NextResponse, type NextRequest } from "next/server";
import { resolvePublicPath } from "@/lib/i18n/paths";
import { isWwwOf, siteUrl } from "@/lib/seo";

export function proxy(request: NextRequest) {
  // One host: www.wonzo.nl served the same pages with a 200 (SEO audit 2026-11-27). Permanent, path and query kept.
  if (isWwwOf(request.headers.get("host"), siteUrl)) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, siteUrl);
    return NextResponse.redirect(url, 308);
  }
  const resolved = resolvePublicPath(request.nextUrl.pathname);
  if (resolved.kind === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = resolved.to;
    return NextResponse.redirect(url, 308);
  }
  const url = request.nextUrl.clone();
  url.pathname = resolved.internalPath;
  return NextResponse.rewrite(url);
}

export const config = {
  // Not for Next internals, API routes, the admin panel (one language, its
  // own root layout in app/beheer/), or files (anything with an extension:
  // /brand/*.svg, /mock/*.svg, /icon.svg, robots.txt).
  matcher: ["/((?!_next/|api/|beheer(?:/|$)|.*\\..*).*)"],
};
