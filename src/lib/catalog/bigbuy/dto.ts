// BigBuy data as it arrives (docs/api/LEVERANCIER.md, GEMETEN 2026-10-05).
// Supplier shapes stay inside src/lib/catalog/bigbuy/ — nothing outside the
// adapter imports this file (eslint no-restricted-imports).
//
// Validation at the edge, by hand: no schema library has been approved, and
// these few shapes do not need one.

if (typeof window !== "undefined") {
  // The token is a secret and the rate limit is shop-wide: never in a browser.
  throw new Error("The supplier adapter must not run in the browser");
}

export type BigBuyProduct = {
  id: number;
  sku: string;
  ean13: string | null;
  manufacturer: number | null;
  taxonomy: number;
  wholesalePrice: number | string;
  retailPrice: number | string;
  taxRate: number;
  condition: string;
  active: number;
  intrastat: string | null;
  dateAdd: string;
  weight?: number;
  height?: number;
  width?: number;
  depth?: number;
};

export type BigBuyStock = {
  id: number;
  sku: string;
  stocks: { quantity: number; minHandlingDays: number; maxHandlingDays: number; warehouse: number }[];
};

export type BigBuyInformation = { id: number; sku: string; name: string; description: string; isoCode: string };

export type BigBuyImages = { id: number; images: { id: number; isCover: boolean; url: string; position: number }[] };

export type BigBuyCompliance = {
  id: number;
  sku: string;
  generalProductSafetyRegulations: {
    name: string;
    countryIsoCode: string | null;
    address: string | null;
    contact: string | null;
    webSite: string | null;
    safetyWarnings: unknown[];
  }[];
};

/** One row of /shipping/lowest-shipping-costs-by-country/nl; "cost" is a string (GEMETEN 2026-10-05). */
export type BigBuyLowestShipping = { reference: string; cost: string; carrierName: string | null };

export type BigBuyTaxonomy = { id: number; name: string; parentTaxonomy: number };

export type BigBuyManufacturer = { id: number; name: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === "string";
const isAmount = (x: unknown) => isNum(x) || (isStr(x) && /^\d+([.,]\d+)?$/.test(x.trim()));

/** Returns the product, or null when it does not match the measured shape. */
export function parseProduct(x: unknown): BigBuyProduct | null {
  if (!isObj(x)) return null;
  if (!isNum(x.id) || !isStr(x.sku) || !isNum(x.taxonomy)) return null;
  if (!isAmount(x.wholesalePrice) || !isAmount(x.retailPrice)) return null;
  if (!isNum(x.taxRate) || !isStr(x.condition) || !isNum(x.active) || !isStr(x.dateAdd)) return null;
  return x as unknown as BigBuyProduct;
}

export function parseStock(x: unknown): BigBuyStock | null {
  if (!isObj(x) || !isNum(x.id) || !Array.isArray(x.stocks)) return null;
  const ok = x.stocks.every((s) => isObj(s) && isNum(s.quantity) && isNum(s.minHandlingDays) && isNum(s.maxHandlingDays));
  return ok ? (x as unknown as BigBuyStock) : null;
}

export function parseLowestShipping(x: unknown): BigBuyLowestShipping | null {
  if (!isObj(x) || !isStr(x.reference) || !isStr(x.cost) || !isAmount(x.cost)) return null;
  return { reference: x.reference, cost: x.cost, carrierName: isStr(x.carrierName) ? x.carrierName : null };
}

export function parseTaxonomy(x: unknown): BigBuyTaxonomy | null {
  if (!isObj(x) || !isNum(x.id) || !isStr(x.name) || !isNum(x.parentTaxonomy)) return null;
  return { id: x.id, name: x.name, parentTaxonomy: x.parentTaxonomy };
}

export function parseManufacturer(x: unknown): BigBuyManufacturer | null {
  if (!isObj(x) || !isNum(x.id) || !isStr(x.name)) return null;
  return { id: x.id, name: x.name };
}

/**
 * The only image host (GEMETEN 2026-10-05) and the only one next.config.mjs
 * lets the image optimiser fetch from. A photo elsewhere is dropped here —
 * the optimiser would refuse it and break the page; the product then shows
 * our placeholder.
 */
export const IMAGE_HOST = "cdnbigbuy.com";

const isImageUrl = (u: unknown): u is string => {
  if (!isStr(u)) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname === IMAGE_HOST;
  } catch {
    return false;
  }
};

export function parseImages(x: unknown): BigBuyImages | null {
  if (!isObj(x) || !isNum(x.id) || !Array.isArray(x.images)) return null;
  const images = x.images.filter((i): i is { id: number; isCover: boolean; url: string; position: number } =>
    isObj(i) && isNum(i.id) && isImageUrl(i.url) && isNum(i.position) && typeof i.isCover === "boolean",
  );
  return { id: x.id, images: images.map((i) => ({ id: i.id, isCover: i.isCover, url: i.url, position: i.position })) };
}

/** One answer of /productcompliance/{id}; the regulations list may be empty. */
export function parseCompliance(id: number, sku: string, x: unknown): BigBuyCompliance | null {
  if (!isObj(x)) return null;
  const list = Array.isArray(x.generalProductSafetyRegulations) ? x.generalProductSafetyRegulations : [];
  const regulations = list
    .filter((r): r is Record<string, unknown> => isObj(r) && isStr(r.name))
    .map((r) => ({
      name: r.name as string,
      countryIsoCode: isStr(r.countryIsoCode) ? r.countryIsoCode : null,
      address: isStr(r.address) ? r.address : null,
      contact: isStr(r.contact) ? r.contact : null,
      webSite: isStr(r.webSite) ? r.webSite : null,
      safetyWarnings: Array.isArray(r.safetyWarnings) ? r.safetyWarnings : [],
    }));
  return { id, sku, generalProductSafetyRegulations: regulations };
}

export function parseInformation(x: unknown): BigBuyInformation | null {
  if (!isObj(x) || !isNum(x.id) || !isStr(x.name) || !isStr(x.isoCode)) return null;
  return { id: x.id, sku: isStr(x.sku) ? x.sku : "", name: x.name, description: isStr(x.description) ? x.description : "", isoCode: x.isoCode };
}
