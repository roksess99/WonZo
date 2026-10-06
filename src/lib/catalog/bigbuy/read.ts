// The shop's view of the catalog copy: the sellable products, mapped to the
// canonical Product with the same code as the mock (D-31).

import { getPool, selectRows } from "@/lib/db";
import type { Locale } from "@/lib/i18n/config";
import type { Product } from "../types";
import { toProduct } from "./map";
import { toSupplierRecord } from "./records";
import { loadCatalogRows, loadTaxonomyTree, SOURCE } from "./store";

/** The id of the last finished refresh; changes when the copy changes. null = no refresh finished yet. */
export async function catalogVersion(): Promise<number | null> {
  const [row] = await selectRows<{ id: number | null }>(getPool(), "SELECT MAX(id) AS id FROM catalog_sync_runs WHERE status = 'ok'");
  return row?.id === null || row?.id === undefined ? null : Number(row.id);
}

/**
 * Every product the last refresh marked sellable, in one language. The
 * selection rule runs again here on the same data: a product the rule
 * refuses never reaches a page, whatever the flag says.
 */
export async function loadDatabaseCatalog(locale: Locale): Promise<Product[]> {
  const pool = getPool();
  const ids = (await selectRows<{ product_id: number }>(pool, "SELECT product_id FROM catalog_products WHERE source = ? AND sellable = 1 ORDER BY product_id", [SOURCE])).map(
    (r) => Number(r.product_id),
  );
  const rows = await loadCatalogRows(pool, ids, { descriptions: true, images: true, tree: await loadTaxonomyTree(pool) });
  return rows.map((r) => toProduct(locale, toSupplierRecord(r)).product).filter((p): p is Product => p !== null);
}
