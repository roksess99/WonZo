// Language routing (D-32): Dutch without a prefix, English under /en with
// English words. Public URLs are rewritten onto the internal routes in
// app/[lang]/ (Dutch words); "/nl/..." is not a public URL and redirects.

import { NextResponse, type NextRequest } from "next/server";
import { resolvePublicPath } from "@/lib/i18n/paths";

export function proxy(request: NextRequest) {
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
  // Not for Next internals, API routes, or files (anything with an extension:
  // /brand/*.svg, /mock/*.svg, /icon.svg, robots.txt).
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
