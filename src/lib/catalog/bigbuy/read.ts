// The shop's view of the catalog copy: the sellable products, mapped to the
// canonical Product with the same code as the mock (D-31), in ../provider.ts.

import { getPool, selectRows } from "@/lib/db";
import type { SupplierRecord } from "./map";
import { toSupplierRecord } from "./records";
import { loadCatalogRows, loadTaxonomyTree, SOURCE } from "./store";

/** The id of the last finished refresh; changes when the copy changes. null = no refresh finished yet. */
export async function catalogVersion(): Promise<number | null> {
  const [row] = await selectRows<{ id: number | null }>(getPool(), "SELECT MAX(id) AS id FROM catalog_sync_runs WHERE status = 'ok'");
  return row?.id === null || row?.id === undefined ? null : Number(row.id);
}

/**
 * Every product the last refresh marked sellable, as supplier records in both
 * languages. The selection rule and the price rule run again on them
 * (./map.ts): a product the rule refuses never reaches a page, whatever the
 * flag says.
 */
export async function loadDatabaseRecords(): Promise<SupplierRecord[]> {
  const pool = getPool();
  const ids = (await selectRows<{ product_id: number }>(pool, "SELECT product_id FROM catalog_products WHERE source = ? AND sellable = 1 ORDER BY product_id", [SOURCE])).map(
    (r) => Number(r.product_id),
  );
  const rows = await loadCatalogRows(pool, ids, { descriptions: true, images: true, tree: await loadTaxonomyTree(pool) });
  return rows.map(toSupplierRecord);
}
