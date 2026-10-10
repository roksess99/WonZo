// Reading and writing the catalog copy (db/migrations/0001_catalog.sql).
// Inside the adapter: the rest of the shop sees only the canonical Product
// (.claude/rules/catalogus.md). Parameterised SQL only.

import { selectRows, type Queryable } from "@/lib/db";
import type { CatalogRows, ImageRow, ProductRow, SafetyRow, ShippingRow, StockRow, TextRow } from "./records";
import { taxonomyPathOf } from "./records";

export const SOURCE = "bigbuy";
const CHUNK = 500;

export type TaxonomyTree = Map<number, { name: string; parent: number }>;

export async function loadTaxonomyTree(db: Queryable): Promise<TaxonomyTree> {
  const rows = await selectRows<{ id: number; parent_id: number; name: string }>(db, "SELECT id, parent_id, name FROM catalog_taxonomies WHERE source = ?", [SOURCE]);
  return new Map(rows.map((r) => [Number(r.id), { name: r.name, parent: Number(r.parent_id) }]));
}

/** INSERT … ON DUPLICATE KEY UPDATE in chunks. `table` and `columns` are constants of this file, never input. */
export async function upsert(db: Queryable, table: string, columns: string[], rows: unknown[][], update: string[]): Promise<void> {
  if (!rows.length) return;
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ? ON DUPLICATE KEY UPDATE ${update.map((c) => `${c} = VALUES(${c})`).join(", ")}`;
  for (let i = 0; i < rows.length; i += CHUNK) await db.query(sql, [rows.slice(i, i + CHUNK)]);
}

/**
 * The rows of these products, grouped per product, ready for toSupplierRecord.
 * `descriptions: false` leaves the long texts out (the selection rule needs
 * only names); `images: false` skips the photos.
 */
export async function loadCatalogRows(
  db: Queryable,
  ids: number[],
  opts: { descriptions: boolean; images: boolean; tree: TaxonomyTree },
): Promise<CatalogRows[]> {
  const out: CatalogRows[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    if (!chunk.length) continue;
    const products = await selectRows<ProductRow>(
      db,
      `SELECT product_id, sku, ean, manufacturer_id, taxonomy_id, cost_cents, advised_cents, tax_rate, condition_code, active, hs_code,
              added_at, width, height, depth, weight, seen_run_id
         FROM catalog_products WHERE source = ? AND product_id IN (?)`,
      [SOURCE, chunk],
    );
    const texts = await selectRows<TextRow>(
      db,
      `SELECT product_id, locale, name, ${opts.descriptions ? "description" : "'' AS description"} FROM catalog_texts WHERE source = ? AND product_id IN (?)`,
      [SOURCE, chunk],
    );
    const stock = await selectRows<StockRow>(db, "SELECT product_id, warehouse, min_days, max_days, quantity FROM catalog_stock WHERE source = ? AND product_id IN (?)", [SOURCE, chunk]);
    const images = opts.images
      ? await selectRows<ImageRow>(db, "SELECT product_id, image_id, position, is_cover, url FROM catalog_images WHERE source = ? AND product_id IN (?)", [SOURCE, chunk])
      : [];
    const safety = await selectRows<SafetyRow>(db, "SELECT product_id, http_status, regulations FROM catalog_safety WHERE source = ? AND product_id IN (?)", [SOURCE, chunk]);
    const skus = products.map((p) => p.sku);
    const shipping = skus.length
      ? await selectRows<ShippingRow>(db, "SELECT sku, cost_cents, carrier FROM catalog_shipping WHERE source = ? AND sku IN (?)", [SOURCE, skus])
      : [];
    const manufacturerIds = [...new Set(products.map((p) => p.manufacturer_id).filter((m): m is number => m !== null))];
    const brands = manufacturerIds.length
      ? await selectRows<{ id: number; name: string }>(db, "SELECT id, name FROM catalog_manufacturers WHERE source = ? AND id IN (?)", [SOURCE, manufacturerIds])
      : [];

    const by = <T extends { product_id: number | string }>(rows: T[]) => {
      const m = new Map<number, T[]>();
      for (const r of rows) m.set(Number(r.product_id), [...(m.get(Number(r.product_id)) ?? []), r]);
      return m;
    };
    const textsBy = by(texts);
    const stockBy = by(stock);
    const imagesBy = by(images);
    const safetyBy = by(safety);
    const shippingBy = new Map(shipping.map((s) => [s.sku, s]));
    const brandBy = new Map(brands.map((b) => [Number(b.id), b.name]));
    for (const p of products) {
      const id = Number(p.product_id);
      out.push({
        product: p,
        texts: textsBy.get(id) ?? [],
        stock: stockBy.get(id) ?? [],
        images: imagesBy.get(id) ?? [],
        safety: safetyBy.get(id)?.[0] ?? null,
        shipping: shippingBy.get(p.sku) ?? null,
        taxonomyPath: taxonomyPathOf(Number(p.taxonomy_id), opts.tree),
        brand: p.manufacturer_id !== null ? (brandBy.get(Number(p.manufacturer_id)) ?? null) : null,
      });
    }
  }
  return out;
}
