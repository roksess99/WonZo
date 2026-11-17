// The test banner above every shop page. It says only what is true (user
// 2026-11-13: "not a test environment any more"): example products, the full
// notice; real products but no checking out yet, only that; both real, no
// banner. So the live shop loses it by itself at launch
// (CATALOG_SOURCE=database, and CHECKOUT_ENABLED=true with a payment key and
// a database — docs/CHECKLIST.md). Pure: no React, no I/O.

export function testBanner(source: "mock" | "database", canCheckOut: boolean, t: { banner: string; noCheckout: string }): string | null {
  if (source === "mock") return t.banner;
  return canCheckOut ? null : t.noCheckout;
}
