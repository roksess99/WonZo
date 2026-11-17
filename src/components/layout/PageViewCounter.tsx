"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Counts a page view on our own server (D-10, owner 2026-10-15): only the
 * path, no cookie, nothing kept in the browser. After the page is shown, so it
 * never slows it down; a prefetch is not a view.
 */
export function PageViewCounter() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    fetch("/api/stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: pathname }), keepalive: true }).catch(() => {});
  }, [pathname]);
  return null;
}
