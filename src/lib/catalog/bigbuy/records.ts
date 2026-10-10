// Rows of the catalog copy in the database (db/migrations/0001_catalog.sql)
// → the SupplierRecord that toProduct() already maps. Mock and database go
// through the same mapping and the same selection rule (D-02), so what the
// owner tested on the mock is what the real catalog does. Pure, no I/O.

import type { Locale } from "@/lib/i18n/config";
import { parseCompliance, type BigBuyCompliance, type BigBuyInformation, type BigBuyProduct } from "./dto";
import type { SupplierRecord } from "./map";

export type ProductRow = {
  product_id: number | string;
  sku: string;
  ean: string | null;
  manufacturer_id: number | null;
  taxonomy_id: number;
  cost_cents: number | string;
  advised_cents: number | string;
  tax_rate: number | string;
  condition_code: string;
  active: number;
  hs_code: string | null;
  added_at: string;
  width: number | string | null;
  height: number | string | null;
  depth: number | string | null;
  weight: number | string | null;
  /** The last full run that saw this product at the supplier. */
  seen_run_id?: number | string | null;
};
export type TextRow = { product_id: number | string; locale: string; name: string; description: string };
export type StockRow = { product_id: number | string; warehouse: number; min_days: number; max_days: number; quantity: number };
export type ImageRow = { product_id: number | string; image_id: number | string; position: number; is_cover: number; url: string };
export type SafetyRow = { product_id: number | string; http_status: number; regulations: unknown };
export type ShippingRow = { sku: string; cost_cents: number | string; carrier: string | null };

/** Cents (integer) → "18.22", the decimal string the mapping converts back exactly. */
export function centsToDecimal(cents: number | string): string {
  const c = Number(cents);
  if (!Number.isSafeInteger(c) || c < 0) throw new Error(`Not an amount in cents: ${JSON.stringify(cents)}`);
  return `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, "0")}`;
}

const num = (v: number | string | null) => (v === null ? undefined : Number(v));

/** JSON columns come back parsed or as text, depending on server and driver. */
function parseJson(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

export type CatalogRows = {
  product: ProductRow;
  texts: TextRow[];
  stock: StockRow[];
  images: ImageRow[];
  safety: SafetyRow | null;
  shipping: ShippingRow | null;
  taxonomyPath: string[];
  brand: string | null;
};

export function toSupplierRecord(rows: CatalogRows): SupplierRecord {
  const id = Number(rows.product.product_id);
  const p = rows.product;
  const product: BigBuyProduct = {
    id,
    sku: p.sku,
    ean13: p.ean,
    manufacturer: p.manufacturer_id,
    taxonomy: p.taxonomy_id,
    wholesalePrice: centsToDecimal(p.cost_cents),
    retailPrice: centsToDecimal(p.advised_cents),
    taxRate: Number(p.tax_rate),
    condition: p.condition_code,
    active: Number(p.active),
    intrastat: p.hs_code,
    dateAdd: p.added_at,
    width: num(p.width),
    height: num(p.height),
    depth: num(p.depth),
    weight: num(p.weight),
  };
  const info: Partial<Record<Locale, BigBuyInformation>> = {};
  for (const t of rows.texts) {
    if (t.locale === "nl" || t.locale === "en") info[t.locale] = { id, sku: p.sku, name: t.name, description: t.description, isoCode: t.locale };
  }
  const regulations = rows.safety && rows.safety.http_status === 200 ? parseJson(rows.safety.regulations) : null;
  // Through the same parser as the supplier's answer: rows stored before a
  // parser fix (warnings as objects) read the same as new ones.
  const compliance: BigBuyCompliance | null = Array.isArray(regulations)
    ? parseCompliance(id, p.sku, { generalProductSafetyRegulations: regulations })
    : null;
  return {
    product,
    stock: { id, sku: p.sku, stocks: rows.stock.map((s) => ({ quantity: s.quantity, minHandlingDays: s.min_days, maxHandlingDays: s.max_days, warehouse: s.warehouse })) },
    info,
    images: rows.images.length
      ? { id, images: rows.images.map((i) => ({ id: Number(i.image_id), isCover: Number(i.is_cover) === 1, url: i.url, position: i.position })) }
      : null,
    compliance,
    shipping: rows.shipping ? { reference: rows.shipping.sku, cost: centsToDecimal(rows.shipping.cost_cents), carrierName: rows.shipping.carrier } : null,
    taxonomyPath: rows.taxonomyPath,
    brand: rows.brand,
  };
}

/** Supplier taxonomy names root first, from a map id → {name, parent}. */
export function taxonomyPathOf(id: number, tree: Map<number, { name: string; parent: number }>): string[] {
  const names: string[] = [];
  let cur = tree.get(id);
  for (let guard = 0; cur && guard < 12; guard++) {
    names.unshift(cur.name);
    cur = cur.parent ? tree.get(cur.parent) : undefined;
  }
  return names;
}
