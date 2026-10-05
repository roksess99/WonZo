// Languages of the shop (D-32): Dutch is the default and has no URL prefix,
// English lives under /en.

export const locales = ["nl", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "nl";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Supplier language code (BigBuy `isoCode`) per shop language. */
export const supplierLanguage: Record<Locale, string> = { nl: "nl", en: "en" };
