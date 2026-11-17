// Where the parcels are (D-09, owner 2026-10-13: tracking first, so the
// withdrawal window can run from the delivery). The orders job asks the
// supplier about every purchase order that was placed and not delivered yet,
// at most every TRACKING_EVERY_MS, in one call for up to 50. A parcel with a
// tracking number: the purchase order is SHIPPED, and once all of an order's
// purchase orders are, the order too — with the "on its way" mail. Every
// parcel delivered: DELIVERED. Which status words the supplier uses is not
// measured yet (docs/api/VRAGEN.md vraag 25), so the admin can mark an order
// delivered by hand. Server-side only.

import { appendAudit } from "@/lib/admin/audit";
import type { Parcel, SupplierOrdering } from "@/lib/catalog/ordering";
import { getPool, selectRows, toDbTime, withTransaction, type Connection, type Queryable } from "@/lib/db";
import { supplierOrdersOf, transitionSupplierOrder } from "./purchasing";
import { lockOrder, transitionOrder } from "./store";
import type { SupplierActor } from "./supplier-states";

/** How often a parcel on its way is asked about: a few times a day is plenty for a delivery date. */
export const TRACKING_EVERY_MS = 2 * 3_600_000;
/** No answer: ask again sooner than the normal round, but not every minute. */
const TRACKING_RETRY_MS = 30 * 60_000;
const BATCH = 50;

const latest = (parcels: Parcel[]): Date | null =>
  parcels.reduce<Date | null>((d, p) => (p.statusAt && (!d || p.statusAt > d) ? p.statusAt : d), null);

/** Stores what the supplier said about one purchase order's parcels. Caller holds the order lock. */
async function storeParcels(conn: Connection, supplierOrderId: string, parcels: Parcel[], now: Date): Promise<void> {
  for (const p of parcels) {
    await conn.query(
      `INSERT INTO shipments (supplier_order_id, tracking_number, carrier, status_text, status_at, delivered, first_seen_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE carrier = COALESCE(VALUES(carrier), carrier), status_text = VALUES(status_text), status_at = VALUES(status_at), delivered = VALUES(delivered), updated_at = VALUES(updated_at)`,
      [supplierOrderId, p.trackingNumber, p.carrier, p.statusText, p.statusAt ? toDbTime(p.statusAt) : null, p.delivered ? 1 : 0, toDbTime(now), toDbTime(now)],
    );
  }
}

/**
 * The order follows its purchase orders: all at least shipped → SHIPPED (and
 * the mail), all delivered → DELIVERED. Caller holds the order lock.
 */
async function followPurchases(conn: Connection, orderId: number, actor: "provider" | "admin", now: Date, deliveredAt: Date | null): Promise<void> {
  const order = await lockOrder(conn, orderId);
  const all = await supplierOrdersOf(conn, orderId);
  if (!order || !all.length) return;
  const shipped = all.every((s) => s.status === "SHIPPED" || s.status === "DELIVERED");
  const delivered = all.every((s) => s.status === "DELIVERED");
  if (shipped && (order.status === "PURCHASED" || order.status === "PARTIALLY_FULFILLED")) {
    await transitionOrder(conn, { orderId, to: "SHIPPED", actor, reason: actor === "admin" ? undefined : "verzonden volgens de leverancier", now });
    await conn.query("UPDATE orders SET shipped_at = COALESCE(shipped_at, ?) WHERE id = ?", [toDbTime(now), orderId]);
  }
  const [row] = await selectRows<{ status: string }>(conn, "SELECT status FROM orders WHERE id = ?", [orderId]);
  if (delivered && row?.status === "SHIPPED") {
    await transitionOrder(conn, { orderId, to: "DELIVERED", actor, reason: actor === "admin" ? undefined : "afgeleverd volgens de leverancier", now });
    // The withdrawal window runs from here (docs/RETOUREN.md): the supplier's moment, or now when it gave none.
    await conn.query("UPDATE orders SET delivered_at = COALESCE(delivered_at, ?) WHERE id = ?", [toDbTime(deliveredAt ?? now), orderId]);
  }
}

export type TrackingRun = { asked: number; shipped: number; delivered: number };

/** One round of the orders job. Without ordering there is nothing at the supplier to ask about. */
export async function runTracking(ordering: SupplierOrdering | null, now: Date = new Date()): Promise<TrackingRun> {
  const run: TrackingRun = { asked: 0, shipped: 0, delivered: 0 };
  if (!ordering) return run;
  const due = await selectRows<{ id: string; order_id: number | string; status: string; supplier_order_ref: string }>(
    getPool(),
    `SELECT id, order_id, status, supplier_order_ref FROM supplier_orders
      WHERE source = ? AND status IN ('PLACED', 'PARTIALLY_SHIPPED', 'SHIPPED') AND supplier_order_ref IS NOT NULL
        AND (tracking_checked_at IS NULL OR tracking_checked_at <= ?)
      ORDER BY tracking_checked_at IS NOT NULL, tracking_checked_at, id LIMIT ?`,
    [ordering.source, toDbTime(new Date(now.getTime() - TRACKING_EVERY_MS)), BATCH],
  );
  if (!due.length) return run;
  const answer = await ordering.tracking(due.map((d) => d.supplier_order_ref));
  run.asked = due.length;
  if (answer.kind === "unknown") {
    // Asked again in half an hour instead of at the next minute.
    const retryAt = new Date(now.getTime() - TRACKING_EVERY_MS + TRACKING_RETRY_MS);
    await getPool().query(`UPDATE supplier_orders SET tracking_checked_at = ? WHERE id IN (${due.map(() => "?").join(", ")})`, [toDbTime(retryAt), ...due.map((d) => d.id)]);
    return run;
  }
  const byRef = new Map(answer.orders.map((o) => [o.supplierOrderRef, o.parcels]));
  // Nothing on its way yet (the usual answer): only the moment of asking, in one statement.
  const quiet = due.filter((so) => !(byRef.get(so.supplier_order_ref) ?? []).length);
  if (quiet.length) await getPool().query(`UPDATE supplier_orders SET tracking_checked_at = ? WHERE id IN (${quiet.map(() => "?").join(", ")})`, [toDbTime(now), ...quiet.map((d) => d.id)]);
  for (const so of due.filter((d) => !quiet.includes(d))) {
    const parcels = byRef.get(so.supplier_order_ref)!;
    const orderId = Number(so.order_id);
    await withTransaction(async (conn) => {
      // The order's row first, then the purchase order — the same order as purchasing and cancelling.
      await lockOrder(conn, orderId);
      await storeParcels(conn, so.id, parcels, now);
      const actor: SupplierActor = "provider";
      if (so.status !== "SHIPPED") {
        await transitionSupplierOrder(conn, { id: so.id, to: "SHIPPED", actor, reason: `${parcels.length} pakket(ten) bij de vervoerder`, now, set: { shipped_at: toDbTime(now) } });
        run.shipped++;
      }
      const deliveredAt = parcels.every((p) => p.delivered) ? (latest(parcels) ?? now) : null;
      if (deliveredAt) {
        await transitionSupplierOrder(conn, { id: so.id, to: "DELIVERED", actor, reason: "afgeleverd volgens de vervoerder", now, set: { delivered_at: toDbTime(deliveredAt) } });
        run.delivered++;
      }
      await conn.query("UPDATE supplier_orders SET tracking_checked_at = ? WHERE id = ?", [toDbTime(now), so.id]);
      await followPurchases(conn, orderId, "provider", now, deliveredAt);
    });
  }
  return run;
}

export type MarkDeliveredResult = { ok: true } | { ok: false; error: "not-found" | "not-allowed" | "reason-required" };

/**
 * The admin marks an order delivered (the supplier's status words are not
 * measured yet, or a customer said so). From PURCHASED it goes through
 * SHIPPED, the way the state machine allows; the withdrawal window starts now.
 */
export async function markDelivered(input: { orderId: number; reason: string; actor: string; now?: Date }): Promise<MarkDeliveredResult> {
  const now = input.now ?? new Date();
  return withTransaction(async (conn): Promise<MarkDeliveredResult> => {
    const order = await lockOrder(conn, input.orderId);
    if (!order) return { ok: false, error: "not-found" };
    if (!["PURCHASED", "PARTIALLY_FULFILLED", "SHIPPED"].includes(order.status) || order.holdReason) return { ok: false, error: "not-allowed" };
    const all = await supplierOrdersOf(conn, order.id, true);
    if (!all.length || all.some((s) => !["PLACED", "PARTIALLY_SHIPPED", "SHIPPED", "DELIVERED"].includes(s.status))) return { ok: false, error: "not-allowed" };
    for (const s of all) {
      if (s.status === "PLACED" || s.status === "PARTIALLY_SHIPPED") await transitionSupplierOrder(conn, { id: s.id, to: "SHIPPED", actor: "admin", reason: input.reason, now, set: { shipped_at: toDbTime(now) } });
      if (s.status !== "DELIVERED") await transitionSupplierOrder(conn, { id: s.id, to: "DELIVERED", actor: "admin", reason: input.reason, now, set: { delivered_at: toDbTime(now) } });
    }
    await followPurchases(conn, order.id, "admin", now, now);
    await appendAudit(conn, { actor: input.actor, action: "order.delivered-marked", objectType: "order", objectId: order.id, before: { status: order.status }, after: { status: "DELIVERED" }, reason: input.reason }, now);
    return { ok: true };
  });
}

/** The parcels of an order, for the status page, the mail and the panel. */
export async function parcelsOfOrder(db: Queryable, orderId: number): Promise<{ trackingNumber: string; carrier: string | null; statusText: string | null; delivered: boolean }[]> {
  const rows = await selectRows<{ tracking_number: string; carrier: string | null; status_text: string | null; delivered: number | string }>(
    db,
    "SELECT sh.tracking_number, sh.carrier, sh.status_text, sh.delivered FROM shipments sh JOIN supplier_orders s ON s.id = sh.supplier_order_id WHERE s.order_id = ? ORDER BY sh.first_seen_at, sh.tracking_number",
    [orderId],
  );
  return rows.map((r) => ({ trackingNumber: r.tracking_number, carrier: r.carrier, statusText: r.status_text, delivered: Number(r.delivered) === 1 }));
}
