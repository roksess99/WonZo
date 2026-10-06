// Refreshes the catalog copy in slices (D-31). One call does as much as the
// time and the supplier's limits allow, writes its progress to the database
// and stops; the next call (cron) continues. Two calls never run together
// (GET_LOCK). No database transaction is open during a supplier call
// (.claude/rules/database.md § Transacties).

import { getPool, hasDatabase, selectRows, type Connection } from "@/lib/db";
import { fromDecimal, MoneyError } from "@/lib/money";
import { assortment, placeInAssortment } from "../assortment";
import { decide, ENDPOINT, nextStep, PHASES, type ProgressRow, type RunKind, type Step } from "../sync/schedule";
import { BudgetExhausted, hasBudget, supplierConfig, supplierGet, SupplierHttpError, type SupplierConfig } from "./client";
import {
  parseCompliance,
  parseImages,
  parseInformation,
  parseLowestShipping,
  parseManufacturer,
  parseProduct,
  parseStock,
  parseTaxonomy,
} from "./dto";
import { toProduct } from "./map";
import { taxonomyPathOf, toSupplierRecord } from "./records";
import { loadCatalogRows, loadTaxonomyTree, SOURCE, upsert, type TaxonomyTree } from "./store";

const PAGE_SIZE = 10_000; // documented maximum, measured to work (2026-10-05)
const MANUFACTURER_PAGE = 1_000;
const SAFETY_MAX_AGE_DAYS = 30;
const EVALUATE_BATCH = 500;

/** "2026-10-06 01:02:03.456" (UTC, dateStrings) → Date. */
const utc = (s: string | null | undefined) => (s ? new Date(`${s.replace(" ", "T")}Z`) : null);
const cents = (v: number | string) => fromDecimal(v).amount;

export type SliceResult =
  | { status: "not-configured"; missing: string[] }
  | { status: "busy" }
  | { status: "idle" }
  | { status: "worked"; runId: number; kind: RunKind; did: string[]; waiting: Step[]; finished: boolean; error?: string };

/** The supplier's top-level groups our assortment draws from, found by name (ids are not hard-coded, .claude/rules/catalogus.md). */
export function assortmentGroups(tree: TaxonomyTree): number[] {
  const names = new Set(assortment.flatMap((c) => c.subcategories.flatMap((s) => s.sources.map((path) => path[0]!.trim().toLowerCase()))));
  return [...tree.entries()].filter(([, t]) => t.parent === 0 && names.has(t.name.trim().toLowerCase())).map(([id]) => id).sort((a, b) => a - b);
}

type Ctx = {
  conn: Connection;
  config: SupplierConfig;
  runId: number;
  kind: RunKind;
  tree?: TaxonomyTree;
  ours?: { ids: Set<number>; skus: Set<string> };
};

async function tree(ctx: Ctx): Promise<TaxonomyTree> {
  ctx.tree ??= await loadTaxonomyTree(ctx.conn);
  return ctx.tree;
}

async function ours(ctx: Ctx): Promise<{ ids: Set<number>; skus: Set<string> }> {
  if (!ctx.ours) {
    const rows = await selectRows<{ product_id: number; sku: string }>(ctx.conn, "SELECT product_id, sku FROM catalog_products WHERE source = ?", [SOURCE]);
    ctx.ours = { ids: new Set(rows.map((r) => Number(r.product_id))), skus: new Set(rows.map((r) => r.sku)) };
  }
  return ctx.ours;
}

const GROUPED: ReadonlySet<Step> = new Set(["products", "images", "stock", "info-nl", "info-en"]);

async function progressRows(conn: Connection, runId: number): Promise<(ProgressRow & { next_page: number })[]> {
  const rows = await selectRows<{ step: Step; group_id: number; done: number; next_page: number }>(
    conn,
    "SELECT step, group_id, done, next_page FROM catalog_sync_progress WHERE run_id = ? ORDER BY step, group_id",
    [runId],
  );
  return rows.map((r) => ({ step: r.step, group: Number(r.group_id), done: Number(r.done) === 1, next_page: Number(r.next_page) }));
}

async function advance(ctx: Ctx, step: Step, group: number, rowsSeen: number, opts: { done: boolean; nextPage?: number }) {
  await ctx.conn.execute(
    `UPDATE catalog_sync_progress SET done = ?, rows_seen = rows_seen + ?, next_page = ${opts.nextPage === undefined ? "next_page + 1" : "?"}
      WHERE run_id = ? AND step = ? AND group_id = ?`,
    opts.nextPage === undefined
      ? [opts.done ? 1 : 0, rowsSeen, ctx.runId, step, group]
      : [opts.done ? 1 : 0, rowsSeen, opts.nextPage, ctx.runId, step, group],
  );
}

/** Replaces the rows of these products in a child table, in one short transaction. */
async function replaceRows(conn: Connection, table: "catalog_stock" | "catalog_images", columns: string[], ids: number[], rows: unknown[][]) {
  if (!ids.length) return;
  await conn.beginTransaction();
  try {
    for (let i = 0; i < ids.length; i += 500) {
      await conn.query(`DELETE FROM ${table} WHERE source = ? AND product_id IN (?)`, [SOURCE, ids.slice(i, i + 500)]);
    }
    for (let i = 0; i < rows.length; i += 500) {
      await conn.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ?`, [rows.slice(i, i + 500)]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  }
}

/** One unit of work of `step`; returns a short label for the log. */
async function doStep(ctx: Ctx, step: Step): Promise<string> {
  const { conn, config } = ctx;
  if (GROUPED.has(step)) {
    const groups = assortmentGroups(await tree(ctx));
    if (!groups.length) throw new Error("No assortment groups found in the supplier taxonomy (names changed?)");
    await conn.query("INSERT IGNORE INTO catalog_sync_progress (run_id, step, group_id) VALUES ?", [groups.map((g) => [ctx.runId, step, g])]);
  } else {
    await conn.execute("INSERT IGNORE INTO catalog_sync_progress (run_id, step, group_id) VALUES (?, ?, 0)", [ctx.runId, step]);
  }
  const row = (await progressRows(conn, ctx.runId)).find((r) => r.step === step && !r.done);
  if (!row) return `${step}: klaar`;
  const { group, next_page: page } = row;
  const list = (json: unknown) => (Array.isArray(json) ? json : []);
  const groupQuery = `parentTaxonomy=${group}&page=${page}&pageSize=${PAGE_SIZE}`;

  switch (step) {
    case "taxonomies": {
      const items = list(await supplierGet(conn, config, "taxonomies", "/rest/catalog/taxonomies.json?isoCode=nl")).map(parseTaxonomy).filter((t) => t !== null);
      await upsert(conn, "catalog_taxonomies", ["source", "id", "parent_id", "name"], items.map((t) => [SOURCE, t.id, t.parentTaxonomy, t.name]), ["parent_id", "name"]);
      ctx.tree = undefined;
      await advance(ctx, step, group, items.length, { done: true });
      return `taxonomieën: ${items.length}`;
    }
    case "manufacturers": {
      const raw = list(await supplierGet(conn, config, "manufacturers", `/rest/catalog/manufacturers.json?page=${page}&pageSize=${MANUFACTURER_PAGE}`));
      const items = raw.map(parseManufacturer).filter((m) => m !== null);
      await upsert(conn, "catalog_manufacturers", ["source", "id", "name"], items.map((m) => [SOURCE, m.id, m.name]), ["name"]);
      await advance(ctx, step, group, items.length, { done: raw.length < MANUFACTURER_PAGE });
      return `merken pagina ${page}: ${items.length}`;
    }
    case "products": {
      const t = await tree(ctx);
      const raw = list(await supplierGet(conn, config, "products", `/rest/catalog/products.json?${groupQuery}`));
      const rows: unknown[][] = [];
      let skipped = 0;
      for (const item of raw) {
        const p = parseProduct(item);
        if (!p) {
          skipped++;
          continue;
        }
        // Only products of the assortment are kept (D-02); the rest of the group is not needed.
        if (!placeInAssortment(taxonomyPathOf(p.taxonomy, t))) continue;
        try {
          rows.push([
            SOURCE, p.id, p.sku, p.ean13 || null, p.manufacturer, p.taxonomy, cents(p.wholesalePrice), cents(p.retailPrice), "EUR", p.taxRate,
            p.condition, p.active, p.intrastat, p.dateAdd, p.width ?? null, p.height ?? null, p.depth ?? null, p.weight ?? null, ctx.runId,
          ]);
        } catch (err) {
          if (!(err instanceof MoneyError)) throw err;
          skipped++; // docs/SUPPLIER_RESILIENCE.md: one broken product never stops a list
        }
      }
      await upsert(
        conn,
        "catalog_products",
        ["source", "product_id", "sku", "ean", "manufacturer_id", "taxonomy_id", "cost_cents", "advised_cents", "currency", "tax_rate",
          "condition_code", "active", "hs_code", "added_at", "width", "height", "depth", "weight", "seen_run_id"],
        rows,
        ["sku", "ean", "manufacturer_id", "taxonomy_id", "cost_cents", "advised_cents", "currency", "tax_rate", "condition_code", "active", "hs_code",
          "added_at", "width", "height", "depth", "weight", "seen_run_id"],
      );
      ctx.ours = undefined;
      await advance(ctx, step, group, rows.length, { done: raw.length < PAGE_SIZE });
      return `producten groep ${group} pagina ${page}: ${rows.length} van ${raw.length} in het assortiment${skipped ? `, ${skipped} overgeslagen` : ""}`;
    }
    case "images": {
      const { ids } = await ours(ctx);
      const raw = list(await supplierGet(conn, config, "productsimages", `/rest/catalog/productsimages.json?${groupQuery}`));
      const items = raw.map(parseImages).filter((i) => i !== null && ids.has(i.id));
      await replaceRows(conn, "catalog_images", ["source", "product_id", "image_id", "position", "is_cover", "url"],
        items.map((i) => i!.id),
        items.flatMap((i) => i!.images.map((img) => [SOURCE, i!.id, img.id, img.position, img.isCover ? 1 : 0, img.url])));
      await advance(ctx, step, group, items.length, { done: raw.length < PAGE_SIZE });
      return `foto's groep ${group} pagina ${page}: ${items.length}`;
    }
    case "stock": {
      const { ids } = await ours(ctx);
      const raw = list(await supplierGet(conn, config, "productsstockbyhandlingdays", `/rest/catalog/productsstockbyhandlingdays.json?${groupQuery}`));
      const items = raw.map(parseStock).filter((s) => s !== null && ids.has(s.id));
      await replaceRows(conn, "catalog_stock", ["source", "product_id", "warehouse", "min_days", "max_days", "quantity"],
        items.map((s) => s!.id),
        items.flatMap((s) => s!.stocks.map((r) => [SOURCE, s!.id, r.warehouse ?? 0, r.minHandlingDays, r.maxHandlingDays, r.quantity])));
      await advance(ctx, step, group, items.length, { done: raw.length < PAGE_SIZE });
      return `voorraad groep ${group} pagina ${page}: ${items.length}`;
    }
    case "info-nl":
    case "info-en": {
      const locale = step === "info-nl" ? "nl" : "en";
      const { ids } = await ours(ctx);
      const raw = list(await supplierGet(conn, config, "productsinformation", `/rest/catalog/productsinformation.json?isoCode=${locale}&${groupQuery}`));
      const items = raw.map(parseInformation).filter((i) => i !== null && ids.has(i.id));
      await upsert(conn, "catalog_texts", ["source", "product_id", "locale", "name", "description"],
        items.map((i) => [SOURCE, i!.id, locale, i!.name.slice(0, 512), i!.description]), ["name", "description"]);
      await advance(ctx, step, group, items.length, { done: raw.length < PAGE_SIZE });
      return `namen ${locale} groep ${group} pagina ${page}: ${items.length}`;
    }
    case "shipping": {
      const { skus } = await ours(ctx);
      // One answer for the whole catalog: 25.9 MB, 16.7 s (GEMETEN 2026-10-05).
      const raw = list(await supplierGet(conn, config, "lowest-shipping-costs", "/rest/shipping/lowest-shipping-costs-by-country/nl.json", 300_000));
      const rows: unknown[][] = [];
      for (const item of raw) {
        const s = parseLowestShipping(item);
        if (!s || !skus.has(s.reference)) continue;
        try {
          rows.push([SOURCE, s.reference, cents(s.cost), s.carrierName]);
        } catch (err) {
          if (!(err instanceof MoneyError)) throw err;
        }
      }
      await upsert(conn, "catalog_shipping", ["source", "sku", "cost_cents", "carrier"], rows, ["cost_cents", "carrier"]);
      await advance(ctx, step, group, rows.length, { done: true });
      return `verzendkosten: ${rows.length}`;
    }
    case "safety":
      return safetyStep(ctx, page);
    case "evaluate":
      return evaluateStep(ctx, page);
  }
}

/**
 * GPSR data (D-34), one product per call (limit: 1 per 5 s), only for
 * products that would be sellable apart from it — no call is spent on a
 * product the selection rule refuses anyway. `cursor` is the last product id done.
 */
async function safetyStep(ctx: Ctx, cursor: number): Promise<string> {
  const { conn } = ctx;
  const t = await tree(ctx);
  for (;;) {
    const candidates = await selectRows<{ product_id: number }>(
      conn,
      `SELECT p.product_id FROM catalog_products p
        WHERE p.source = ? AND p.seen_run_id = ? AND p.active = 1 AND p.condition_code = 'NEW' AND p.product_id > ?
          AND EXISTS (SELECT 1 FROM catalog_stock s WHERE s.source = p.source AND s.product_id = p.product_id AND s.quantity > 0)
          AND NOT EXISTS (SELECT 1 FROM catalog_safety f WHERE f.source = p.source AND f.product_id = p.product_id
                            AND f.fetched_at > NOW(3) - INTERVAL ${SAFETY_MAX_AGE_DAYS} DAY)
        ORDER BY p.product_id LIMIT 20`,
      [SOURCE, ctx.runId, cursor],
    );
    if (!candidates.length) {
      await advance(ctx, "safety", 0, 0, { done: true, nextPage: cursor });
      return "GPSR: klaar";
    }
    const rows = await loadCatalogRows(conn, candidates.map((c) => Number(c.product_id)), { descriptions: false, images: false, tree: t });
    for (const r of rows) {
      const id = Number(r.product.product_id);
      // Would it be sellable with GPSR data? Then it is worth a call.
      const record = toSupplierRecord(r);
      record.compliance = { id, sku: r.product.sku, generalProductSafetyRegulations: [{ name: "?", countryIsoCode: null, address: "?", contact: null, webSite: null, safetyWarnings: [] }] };
      if (!toProduct("nl", record).verdict.allowed) {
        cursor = id;
        continue;
      }
      const json = await supplierGet(conn, ctx.config, "productcompliance", `/rest/catalog/productcompliance/${id}.json?isoCode=nl`, 30_000);
      const parsed = json === null ? null : parseCompliance(id, r.product.sku, json);
      await upsert(conn, "catalog_safety", ["source", "product_id", "http_status", "regulations"],
        [[SOURCE, id, json === null ? 404 : 200, parsed ? JSON.stringify(parsed.generalProductSafetyRegulations) : null]], ["http_status", "regulations"]);
      await advance(ctx, "safety", 0, 1, { done: false, nextPage: id });
      return `GPSR ${r.product.sku}: ${parsed?.generalProductSafetyRegulations.length ? "fabrikant gevonden" : "geen gegevens"}`;
    }
    await advance(ctx, "safety", 0, 0, { done: false, nextPage: cursor });
  }
}

/**
 * Decides per product whether the shop shows it (D-02), with the same
 * mapping the shop uses, and records why not. Products the last full run did
 * not see are gone at the supplier. `cursor` is the last product id done.
 */
async function evaluateStep(ctx: Ctx, cursor: number): Promise<string> {
  const { conn } = ctx;
  const [run] = await selectRows<{ started_at: string }>(conn, "SELECT started_at FROM catalog_sync_runs WHERE id = ?", [ctx.runId]);
  if (cursor === 0) {
    // Stock rows this run did not refresh belong to products that left the stock list: no stock.
    await conn.execute("DELETE FROM catalog_stock WHERE source = ? AND updated_at < ?", [SOURCE, run!.started_at]);
  }
  const reference =
    ctx.kind === "full"
      ? ctx.runId
      : Number((await selectRows<{ id: number | null }>(conn, "SELECT MAX(id) AS id FROM catalog_sync_runs WHERE kind = 'full' AND status = 'ok'"))[0]?.id ?? 0);
  const ids = (
    await selectRows<{ product_id: number }>(conn, "SELECT product_id FROM catalog_products WHERE source = ? AND product_id > ? ORDER BY product_id LIMIT ?", [
      SOURCE, cursor, EVALUATE_BATCH,
    ])
  ).map((r) => Number(r.product_id));
  if (!ids.length) {
    await advance(ctx, "evaluate", 0, 0, { done: true, nextPage: cursor });
    return "beoordelen: klaar";
  }
  const rows = await loadCatalogRows(conn, ids, { descriptions: false, images: false, tree: await tree(ctx) });
  let sellable = 0;
  await conn.beginTransaction();
  try {
    for (const r of rows) {
      let reasons: string[];
      if (Number(r.product.seen_run_id ?? 0) !== reference) reasons = ["niet meer bij de leverancier"];
      else {
        const { product, verdict } = toProduct("nl", toSupplierRecord(r));
        reasons = !verdict.allowed ? verdict.reasons : product ? [] : ["geen Nederlandse naam of geen geldige prijs"];
      }
      if (!reasons.length) sellable++;
      await conn.execute("UPDATE catalog_products SET sellable = ?, exclusion_reasons = ?, evaluated_at = NOW(3) WHERE source = ? AND product_id = ?", [
        reasons.length ? 0 : 1, JSON.stringify(reasons), SOURCE, Number(r.product.product_id),
      ]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  }
  await advance(ctx, "evaluate", 0, rows.length, { done: false, nextPage: ids[ids.length - 1]! });
  return `beoordeeld: ${rows.length}, waarvan ${sellable} verkoopbaar`;
}

async function finishRun(conn: Connection, runId: number, status: "ok" | "failed", detail: string) {
  await conn.execute("UPDATE catalog_sync_runs SET status = ?, finished_at = NOW(3), detail = ? WHERE id = ?", [status, detail.slice(0, 2000), runId]);
  // Housekeeping: call counts are only needed for the limits (at most 6 hours back).
  await conn.execute("DELETE FROM catalog_api_calls WHERE called_at < NOW(3) - INTERVAL 1 DAY");
  await conn.execute("DELETE FROM catalog_sync_progress WHERE run_id < ? - 100", [runId]);
}

/** One slice of work. `budgetMs`: stop starting new work after this long. */
export async function runSyncSlice(budgetMs = 40_000, now: () => Date = () => new Date()): Promise<SliceResult> {
  const config = supplierConfig();
  if (!hasDatabase || !config) {
    return { status: "not-configured", missing: [...(hasDatabase ? [] : ["DATABASE_*"]), ...(config ? [] : ["SUPPLIER_API_TOKEN / SUPPLIER_BASE_URL"])] };
  }
  const deadline = Date.now() + budgetMs;
  const conn = await getPool().getConnection();
  let locked = false;
  try {
    const [lock] = await selectRows<{ got: number }>(conn, "SELECT GET_LOCK('wonzo_catalog_sync', 0) AS got");
    if (Number(lock?.got) !== 1) return { status: "busy" };
    locked = true;

    const [running] = await selectRows<{ id: number; kind: RunKind; started_at: string }>(
      conn, "SELECT id, kind, started_at FROM catalog_sync_runs WHERE status = 'running' ORDER BY id DESC LIMIT 1");
    const [lastFull] = await selectRows<{ t: string | null }>(conn, "SELECT MAX(finished_at) AS t FROM catalog_sync_runs WHERE kind = 'full' AND status = 'ok'");
    const [lastAny] = await selectRows<{ t: string | null }>(conn, "SELECT MAX(finished_at) AS t FROM catalog_sync_runs WHERE status = 'ok'");
    const decision = decide({
      now: now(),
      running: running ? { id: Number(running.id), kind: running.kind, startedAt: utc(running.started_at)! } : null,
      lastFullOk: utc(lastFull?.t),
      lastAnyOk: utc(lastAny?.t),
    });
    if (decision.action === "idle") return { status: "idle" };
    let runId: number;
    let kind: RunKind;
    if (decision.action === "continue") ({ runId, kind } = decision);
    else {
      if (decision.action === "abandon-and-start") await finishRun(conn, decision.abandonId, "failed", "vastgelopen: niet binnen 12 uur klaar");
      const [res] = await conn.execute("INSERT INTO catalog_sync_runs (kind, status) VALUES (?, 'running')", [decision.kind]);
      runId = (res as { insertId: number }).insertId;
      kind = decision.kind;
    }

    const ctx: Ctx = { conn, config, runId, kind };
    const did: string[] = [];
    let waiting: Step[] = [];
    let finished = false;
    let error: string | undefined;
    const endpoints = [...new Set(PHASES[kind].flat().map((s) => ENDPOINT[s]).filter((e): e is string => e !== null))];
    // An endpoint the supplier answered with 429 stays closed for this slice,
    // even if our own count says there is room (the counts can differ).
    const refused = new Set<string>();
    while (Date.now() < deadline) {
      const room = new Map<string, boolean>();
      for (const e of endpoints) room.set(e, !refused.has(e) && (await hasBudget(conn, e)));
      const next = nextStep(kind, (await progressRows(conn, runId)), (e) => room.get(e) ?? false);
      if (next.step === null) {
        if (!next.waiting.length) {
          await finishRun(conn, runId, "ok", did.slice(-20).join("; "));
          finished = true;
          break;
        }
        waiting = next.waiting;
        // Only the per-product GPSR limit (1 per 5 s) frees up within this slice.
        if (waiting.every((s) => s === "safety") && Date.now() + 6_500 < deadline) {
          await new Promise((r) => setTimeout(r, 6_100));
          continue;
        }
        break;
      }
      try {
        did.push(await doStep(ctx, next.step));
      } catch (err) {
        if (err instanceof BudgetExhausted) {
          refused.add(err.endpoint);
          continue;
        }
        if (err instanceof SupplierHttpError) {
          error = err.message;
          await conn.execute("UPDATE catalog_sync_runs SET detail = ? WHERE id = ?", [`fout: ${err.message}`.slice(0, 2000), runId]);
          break; // try again on the next call
        }
        throw err;
      }
    }
    return { status: "worked", runId, kind, did, waiting, finished, ...(error ? { error } : {}) };
  } finally {
    if (locked) await conn.query("SELECT RELEASE_LOCK('wonzo_catalog_sync')").catch(() => {});
    conn.release();
  }
}
