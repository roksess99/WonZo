// What the admin panel reads about orders (docs/BEHEER.md § Dashboard, §
// Bestellingen). A work queue, not an archive: "vraagt aandacht" is derived
// from the state of orders, payments and refunds, so it empties itself once
// the problem is solved — nothing to tick off. Server-side only; the pages
// call this only after their permission check, so customer details are never
// fetched for someone who may not see them (.claude/rules/beveiliging.md).

import { amsterdamMonthStartOf, amsterdamYearMonth } from "@/lib/dates";
import { fromDbTime, selectRows, toDbTime, type Queryable } from "@/lib/db";
import { money, type Money } from "@/lib/money";
import { isOrderStatus, type OrderStatus } from "@/lib/orders/states";
import type { PaymentStatus, RefundStatus } from "@/lib/payments/states";
import { invoicesOfOrder } from "@/lib/invoices";
import { supplierOrdersOf, type SupplierOrderRow } from "@/lib/orders/purchasing";
import { parcelsOfOrder } from "@/lib/orders/tracking";
import { returnsOfOrder, type ReturnRow } from "@/lib/returns";

/** The tabs of the order list: what still has to happen first. */
export const ORDER_GROUPS = {
  "te-doen": ["PAID", "FULFILLMENT_PENDING", "PARTIALLY_FULFILLED"],
  "wacht-op-betaling": ["PENDING_PAYMENT", "PAYMENT_FAILED"],
  onderweg: ["PURCHASED", "SHIPPED"],
  afgerond: ["DELIVERED", "COMPLETED", "CANCELLED"],
} as const satisfies Record<string, readonly OrderStatus[]>;
export type OrderGroup = keyof typeof ORDER_GROUPS;
export const isOrderGroup = (x: unknown): x is OrderGroup => typeof x === "string" && x in ORDER_GROUPS;

/** A held order is work, whatever its status. */
function groupWhere(group: OrderGroup): { sql: string; params: string[] } {
  const statuses = [...ORDER_GROUPS[group]];
  const marks = statuses.map(() => "?").join(", ");
  if (group === "te-doen") return { sql: `(status IN (${marks}) OR hold_reason IS NOT NULL)`, params: statuses };
  return { sql: `(status IN (${marks}) AND hold_reason IS NULL)`, params: statuses };
}

/** Midnight on the first of this month in the Netherlands, as an instant. */
export function amsterdamMonthStart(now: Date): Date {
  const { year, month } = amsterdamYearMonth(now);
  return amsterdamMonthStartOf(year, month);
}

export type OrderSummary = {
  counts: Record<OrderGroup, number>;
  onHold: number;
  /** Totals of orders paid since the 1st, before refunds — that is what it is, and it says so. */
  paidThisMonth: { count: number; total: Money };
};

export async function orderSummary(db: Queryable, now: Date): Promise<OrderSummary> {
  const counts = { "te-doen": 0, "wacht-op-betaling": 0, onderweg: 0, afgerond: 0 } as Record<OrderGroup, number>;
  for (const group of Object.keys(ORDER_GROUPS) as OrderGroup[]) {
    const w = groupWhere(group);
    const [row] = await selectRows<{ n: number | string }>(db, `SELECT COUNT(*) AS n FROM orders WHERE ${w.sql}`, w.params);
    counts[group] = Number(row?.n ?? 0);
  }
  const [held] = await selectRows<{ n: number | string }>(db, "SELECT COUNT(*) AS n FROM orders WHERE hold_reason IS NOT NULL");
  const [month] = await selectRows<{ n: number | string; s: number | string | null }>(
    db,
    "SELECT COUNT(*) AS n, SUM(total_cents) AS s FROM orders WHERE paid_at >= ?",
    [toDbTime(amsterdamMonthStart(now))],
  );
  return { counts, onHold: Number(held?.n ?? 0), paidThisMonth: { count: Number(month?.n ?? 0), total: money(Number(month?.s ?? 0)) } };
}

export type AttentionItem =
  | { kind: "hold"; orderId: number; reference: string; status: OrderStatus; holdReason: string }
  /** Paid, but the order did not take it: paid after expiry or a failure (recorded as paid, owner 2026-10-13), or a second payment. */
  | { kind: "paid-not-accepted"; orderId: number; reference: string; status: OrderStatus; paymentId: string; open: Money }
  | { kind: "refund-failed"; orderId: number; reference: string; refundId: string; amount: Money }
  /** More than 10 % above the frozen purchase price (D-04): waits for the owner. */
  | { kind: "purchase-blocked"; orderId: number; reference: string; expected: Money; checked: Money }
  /** Refused, tried again every 30 minutes until `until` (D-04). */
  | { kind: "purchase-failing"; orderId: number; reference: string; error: string; until: Date }
  /** 24 hours of refusals: the owner chooses, try again or pay back (D-04). */
  | { kind: "purchase-gave-up"; orderId: number; reference: string; error: string }
  /** Sent, but no answer that settles it; the code keeps asking by the reference. */
  | { kind: "purchase-unknown"; orderId: number; reference: string }
  /** A mail that could not go out: refused for good, or too many tries (src/lib/mail/worker.ts). */
  | { kind: "mail-failed"; orderId: number; reference: string; outboxId: number; mailKind: string; error: string }
  /** The invoice could not be made (e.g. VAT on shipping with two rates, still open in D-15): nothing is guessed. */
  | { kind: "invoice-failed"; orderId: number; reference: string; outboxId: number; error: string }
  /** Asked, but Mollie's answer never came; reconciliation keeps asking. */
  | { kind: "refund-unknown"; orderId: number; reference: string; refundId: string; amount: Money }
  /** A return waits for the admin: the parcel to come in (REQUESTED), or the judgement (RECEIVED) — D-09. */
  | { kind: "return-waiting"; orderId: number; reference: string; returnId: number; returnNumber: string; returnStatus: "REQUESTED" | "RECEIVED"; max: Money }
  /** Paid back, but its credit note could not be made (e.g. a deduction with two VAT rates, D-15): nothing is guessed. */
  | { kind: "return-credit-missing"; orderId: number; reference: string; returnId: number; returnNumber: string };

/** Everything a person has to decide about, oldest first. Empty in a healthy shop. */
export async function attentionItems(db: Queryable, now: Date): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];
  const held = await selectRows<{ id: number | string; reference: string; status: string; hold_reason: string }>(
    db,
    "SELECT id, reference, status, hold_reason FROM orders WHERE hold_reason IS NOT NULL ORDER BY id LIMIT 100",
  );
  for (const o of held) if (isOrderStatus(o.status)) items.push({ kind: "hold", orderId: Number(o.id), reference: o.reference, status: o.status, holdReason: o.hold_reason });

  // The first paid payment is the one the order took; any other paid one, or one on an order that is
  // not paid (a held order is listed above already), is money to give back or to accept by hand.
  const paid = await selectRows<{ id: string; order_id: number | string; reference: string; status: string; amount_cents: number | string; refunded: number | string }>(
    db,
    `SELECT p.id, p.order_id, o.reference, o.status, p.amount_cents,
            (SELECT COALESCE(SUM(r.amount_cents), 0) FROM refunds r WHERE r.payment_id = p.id AND r.status <> 'FAILED') AS refunded
       FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.status = 'PAID' AND o.hold_reason IS NULL
        AND (o.status IN ('CANCELLED', 'PENDING_PAYMENT', 'PAYMENT_FAILED')
             OR EXISTS (SELECT 1 FROM payments p2 WHERE p2.order_id = p.order_id AND p2.status IN ('PAID', 'CHARGED_BACK')
                          AND (p2.created_at < p.created_at OR (p2.created_at = p.created_at AND p2.id < p.id))))
      ORDER BY p.created_at LIMIT 100`,
  );
  for (const p of paid) {
    const open = Number(p.amount_cents) - Number(p.refunded);
    if (open > 0 && isOrderStatus(p.status)) items.push({ kind: "paid-not-accepted", orderId: Number(p.order_id), reference: p.reference, status: p.status, paymentId: p.id, open: money(open) });
  }

  const purchases = await selectRows<{ order_id: number | string; reference: string; status: string; blocked_reason: string | null; expected_cost_cents: number | string; checked_products_cents: number | string | null; first_failed_at: string | null; gave_up_at: string | null; last_error: string | null; updated_at: string }>(
    db,
    `SELECT s.order_id, o.reference, s.status, s.blocked_reason, s.expected_cost_cents, s.checked_products_cents, s.first_failed_at, s.gave_up_at, s.last_error, s.updated_at
       FROM supplier_orders s JOIN orders o ON o.id = s.order_id
      WHERE s.status IN ('DRAFT', 'REJECTED', 'UNKNOWN') AND (s.blocked_reason IS NOT NULL OR s.first_failed_at IS NOT NULL OR (s.status = 'UNKNOWN' AND s.updated_at < ?))
      ORDER BY s.created_at LIMIT 100`,
    [toDbTime(new Date(now.getTime() - 10 * 60_000))],
  );
  for (const p of purchases) {
    const base = { orderId: Number(p.order_id), reference: p.reference };
    if (p.blocked_reason === "PRICE_INCREASE" && p.checked_products_cents !== null) items.push({ kind: "purchase-blocked", ...base, expected: money(Number(p.expected_cost_cents)), checked: money(Number(p.checked_products_cents)) });
    else if (p.gave_up_at) items.push({ kind: "purchase-gave-up", ...base, error: p.last_error ?? "" });
    else if (p.first_failed_at) items.push({ kind: "purchase-failing", ...base, error: p.last_error ?? "", until: new Date(fromDbTime(p.first_failed_at).getTime() + 24 * 3_600_000) });
    else if (p.status === "UNKNOWN") items.push({ kind: "purchase-unknown", ...base });
  }

  const mails = await selectRows<{ id: number | string; kind: string; last_error: string | null; order_id: number | string; reference: string }>(
    db,
    `SELECT x.id, x.kind, x.last_error, o.id AS order_id, o.reference
       FROM outbox x JOIN orders o ON o.id = CAST(JSON_VALUE(x.payload, '$.orderId') AS UNSIGNED)
      WHERE x.status = 'FAILED' ORDER BY x.id LIMIT 100`,
  );
  for (const x of mails) {
    const base = { orderId: Number(x.order_id), reference: x.reference, outboxId: Number(x.id), error: x.last_error ?? "" };
    items.push(x.kind === "invoice" ? { kind: "invoice-failed", ...base } : { kind: "mail-failed", ...base, mailKind: x.kind });
  }

  // A failed refund stays work until a newer refund on the same payment replaces it.
  const refunds = await selectRows<{ id: string; order_id: number | string; reference: string; status: string; amount_cents: number | string }>(
    db,
    `SELECT r.id, r.order_id, o.reference, r.status, r.amount_cents
       FROM refunds r JOIN orders o ON o.id = r.order_id
      WHERE (r.status = 'FAILED' AND NOT EXISTS (SELECT 1 FROM refunds r2 WHERE r2.payment_id = r.payment_id AND r2.created_at > r.created_at))
         OR (r.status = 'UNKNOWN' AND r.created_at < ?)
      ORDER BY r.created_at LIMIT 100`,
    [toDbTime(new Date(now.getTime() - 10 * 60_000))],
  );
  for (const r of refunds) {
    const base = { orderId: Number(r.order_id), reference: r.reference, refundId: r.id, amount: money(Number(r.amount_cents)) };
    items.push(r.status === "FAILED" ? { kind: "refund-failed", ...base } : { kind: "refund-unknown", ...base });
  }

  const returns = await selectRows<{ id: number | string; number: string; status: string; order_id: number | string; reference: string; max: number | string; credit: number | string | null; closed_at: string | null }>(
    db,
    `SELECT r.id, r.number, r.status, r.order_id, o.reference, r.lines_cents + r.shipping_cents AS max, r.closed_at,
            (SELECT c.id FROM invoices c WHERE c.return_id = r.id LIMIT 1) AS credit
       FROM returns r JOIN orders o ON o.id = r.order_id
      WHERE r.status IN ('REQUESTED', 'RECEIVED') OR (r.status = 'REFUNDED' AND r.closed_at < ?)
      ORDER BY r.id LIMIT 100`,
    [toDbTime(new Date(now.getTime() - 10 * 60_000))],
  );
  for (const r of returns) {
    const base = { orderId: Number(r.order_id), reference: r.reference, returnId: Number(r.id), returnNumber: r.number };
    if (r.status === "REQUESTED" || r.status === "RECEIVED") items.push({ kind: "return-waiting", ...base, returnStatus: r.status, max: money(Number(r.max)) });
    else if (r.credit === null) items.push({ kind: "return-credit-missing", ...base });
  }
  return items;
}

export type OrderListRow = { id: number; reference: string; createdAt: Date; customer: string; total: Money; status: OrderStatus; holdReason: string | null };

const LIST_COLUMNS = "id, reference, created_at, first_name, last_name, total_cents, status, hold_reason";
type RawListRow = { id: number | string; reference: string; created_at: string; first_name: string; last_name: string; total_cents: number | string; status: string; hold_reason: string | null };
const toListRow = (r: RawListRow): OrderListRow[] =>
  isOrderStatus(r.status)
    ? [{ id: Number(r.id), reference: r.reference, createdAt: fromDbTime(r.created_at), customer: `${r.first_name} ${r.last_name}`, total: money(Number(r.total_cents)), status: r.status, holdReason: r.hold_reason }]
    : [];

export const PAGE_SIZE = 25;

/** One page of a tab. To do: oldest first (a queue); the rest: newest first. */
export async function listOrders(db: Queryable, group: OrderGroup, page: number): Promise<{ rows: OrderListRow[]; total: number; pages: number }> {
  const w = groupWhere(group);
  const [count] = await selectRows<{ n: number | string }>(db, `SELECT COUNT(*) AS n FROM orders WHERE ${w.sql}`, w.params);
  const total = Number(count?.n ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const at = Math.min(Math.max(1, page), pages);
  const order = group === "te-doen" ? "id ASC" : "id DESC";
  const rows = await selectRows<RawListRow>(db, `SELECT ${LIST_COLUMNS} FROM orders WHERE ${w.sql} ORDER BY ${order} LIMIT ? OFFSET ?`, [
    ...w.params,
    PAGE_SIZE,
    (at - 1) * PAGE_SIZE,
  ]);
  return { rows: rows.flatMap(toListRow), total, pages };
}

/** "WZ-2026-00001" or "WZ-2026" (start of a number), or an exact e-mail address: the two things a customer calls with. */
export function parseOrderSearch(term: string): { kind: "reference"; prefix: string } | { kind: "email"; email: string } | null {
  const t = term.trim();
  if (/^WZ-\d{4}(-\d{0,5})?$/i.test(t)) return { kind: "reference", prefix: t.toUpperCase() };
  if (/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(t) && t.length <= 254) return { kind: "email", email: t.toLowerCase() };
  return null;
}

export async function searchOrders(db: Queryable, term: string): Promise<OrderListRow[] | null> {
  const q = parseOrderSearch(term);
  if (!q) return null;
  const rows =
    q.kind === "reference"
      ? await selectRows<RawListRow>(db, `SELECT ${LIST_COLUMNS} FROM orders WHERE reference LIKE ? ORDER BY id DESC LIMIT 20`, [`${q.prefix}%`])
      : await selectRows<RawListRow>(db, `SELECT ${LIST_COLUMNS} FROM orders WHERE LOWER(email) = ? ORDER BY id DESC LIMIT 20`, [q.email]);
  return rows.flatMap(toListRow);
}

export type AdminOrder = {
  id: number;
  reference: string;
  status: OrderStatus;
  holdReason: string | null;
  locale: string;
  createdAt: Date;
  paidAt: Date | null;
  snapshotExpiresAt: Date;
  cancelWindowEndsAt: Date | null;
  shippedAt: Date | null;
  /** The withdrawal window runs from here (D-09). */
  deliveredAt: Date | null;
  customer: { firstName: string; lastName: string; street: string; houseNumber: string; postcode: string; city: string; country: string; email: string; phone: string };
  lines: {
    lineNo: number;
    name: string;
    brand: string | null;
    sku: string;
    source: string;
    productId: string;
    offerId: string;
    quantity: number;
    unitPrice: Money;
    lineTotal: Money;
    vatRateBp: number;
    largeShipping: Money | null;
    /** Purchase price per piece when the order was placed (D-16: landed cost = supplier cost for now). */
    supplierCost: Money;
  }[];
  subtotal: Money;
  shippingStandard: Money;
  shippingLarge: Money;
  total: Money;
  payments: {
    id: string;
    status: PaymentStatus;
    amount: Money;
    method: string | null;
    providerPaymentId: string | null;
    createdAt: Date;
  }[];
  refunds: { id: string; paymentId: string; status: RefundStatus; amount: Money; reason: string; requestedBy: string; providerRefundId: string | null; createdAt: Date }[];
  events: { from: string | null; to: string; actor: string; reason: string | null; at: Date }[];
  purchases: (SupplierOrderRow & { events: { to: string; actor: string; reason: string | null; at: Date }[] })[];
  /** Mail for this order that could not go out (src/lib/mail/worker.ts). */
  failedMails: { id: number; kind: string; error: string }[];
  /** The invoice and credit notes of this order (src/lib/invoices). */
  invoices: { id: number; number: string; kind: "invoice" | "credit" }[];
  /** What the supplier reports about the parcels (src/lib/orders/tracking.ts). */
  parcels: { trackingNumber: string; carrier: string | null; statusText: string | null; delivered: boolean }[];
  returns: ReturnRow[];
  audit: { actor: string; action: string; reason: string | null; at: Date }[];
};

type Raw = Record<string, string | number | null>;
const s = (r: Raw, k: string) => String(r[k] ?? "");
const n = (r: Raw, k: string) => Number(r[k] ?? 0);
const d = (r: Raw, k: string) => (r[k] === null || r[k] === undefined ? null : fromDbTime(String(r[k])));

export async function readAdminOrder(db: Queryable, orderId: number): Promise<AdminOrder | null> {
  const [o] = await selectRows<Raw>(
    db,
    `SELECT id, reference, status, hold_reason, locale, currency, created_at, paid_at, snapshot_expires_at, cancel_window_ends_at, shipped_at, delivered_at,
            email, phone, first_name, last_name, street, house_number, postcode, city, country,
            subtotal_cents, shipping_standard_cents, shipping_large_cents, total_cents
       FROM orders WHERE id = ?`,
    [orderId],
  );
  if (!o || !isOrderStatus(s(o, "status")) || o.currency !== "EUR") return null;
  const [lines, payments, refunds, events, audit, purchases, purchaseEvents, failedMails, invoices, parcels, returns] = await Promise.all([
    selectRows<Raw>(
      db,
      "SELECT line_no, name, brand, sku, source, product_id, offer_id, quantity, unit_price_cents, line_total_cents, vat_rate_bp, large_shipping_cents, supplier_cost_cents, supplier_cost_currency FROM order_lines WHERE order_id = ? ORDER BY line_no",
      [orderId],
    ),
    selectRows<Raw>(
      db,
      "SELECT p.id, p.status, p.amount_cents, p.method, p.provider_payment_id, p.created_at FROM payments p WHERE p.order_id = ? ORDER BY p.created_at, p.id",
      [orderId],
    ),
    selectRows<Raw>(db, "SELECT id, payment_id, status, amount_cents, reason, requested_by, provider_refund_id, created_at FROM refunds WHERE order_id = ? ORDER BY created_at, id", [orderId]),
    selectRows<Raw>(db, "SELECT from_status, to_status, actor, reason, at FROM order_events WHERE order_id = ? ORDER BY id", [orderId]),
    selectRows<Raw>(db, "SELECT actor, action, reason, at FROM audit_log WHERE object_type = 'order' AND object_id = ? ORDER BY id", [String(orderId)]),
    supplierOrdersOf(db, orderId),
    selectRows<Raw>(
      db,
      "SELECT e.supplier_order_id, e.to_status, e.actor, e.reason, e.at FROM supplier_order_events e JOIN supplier_orders s ON s.id = e.supplier_order_id WHERE s.order_id = ? ORDER BY e.id",
      [orderId],
    ),
    selectRows<Raw>(db, "SELECT id, kind, last_error FROM outbox WHERE status = 'FAILED' AND JSON_VALUE(payload, '$.orderId') = ? ORDER BY id", [orderId]),
    invoicesOfOrder(db, orderId),
    parcelsOfOrder(db, orderId),
    returnsOfOrder(db, orderId),
  ]);
  return {
    id: n(o, "id"),
    reference: s(o, "reference"),
    status: s(o, "status") as OrderStatus,
    holdReason: o.hold_reason === null ? null : s(o, "hold_reason"),
    locale: s(o, "locale"),
    createdAt: d(o, "created_at")!,
    paidAt: d(o, "paid_at"),
    snapshotExpiresAt: d(o, "snapshot_expires_at")!,
    cancelWindowEndsAt: d(o, "cancel_window_ends_at"),
    shippedAt: d(o, "shipped_at"),
    deliveredAt: d(o, "delivered_at"),
    customer: {
      firstName: s(o, "first_name"), lastName: s(o, "last_name"), street: s(o, "street"), houseNumber: s(o, "house_number"),
      postcode: s(o, "postcode"), city: s(o, "city"), country: s(o, "country"), email: s(o, "email"), phone: s(o, "phone"),
    },
    lines: lines.map((l) => {
      // Purchase prices are EUR today; another currency is not something to show as if it were.
      if (l.supplier_cost_currency !== "EUR") throw new Error(`order ${orderId}: supplier cost in ${s(l, "supplier_cost_currency")}`);
      return {
        lineNo: n(l, "line_no"), name: s(l, "name"), brand: l.brand === null ? null : s(l, "brand"), sku: s(l, "sku"), source: s(l, "source"),
        productId: s(l, "product_id"), offerId: s(l, "offer_id"), quantity: n(l, "quantity"), unitPrice: money(n(l, "unit_price_cents")),
        lineTotal: money(n(l, "line_total_cents")), vatRateBp: n(l, "vat_rate_bp"),
        largeShipping: l.large_shipping_cents === null ? null : money(n(l, "large_shipping_cents")), supplierCost: money(n(l, "supplier_cost_cents")),
      };
    }),
    subtotal: money(n(o, "subtotal_cents")),
    shippingStandard: money(n(o, "shipping_standard_cents")),
    shippingLarge: money(n(o, "shipping_large_cents")),
    total: money(n(o, "total_cents")),
    payments: payments.map((p) => ({
      id: s(p, "id"), status: s(p, "status") as PaymentStatus, amount: money(n(p, "amount_cents")), method: p.method === null ? null : s(p, "method"),
      providerPaymentId: p.provider_payment_id === null ? null : s(p, "provider_payment_id"), createdAt: d(p, "created_at")!,
    })),
    refunds: refunds.map((r) => ({
      id: s(r, "id"), paymentId: s(r, "payment_id"), status: s(r, "status") as RefundStatus, amount: money(n(r, "amount_cents")), reason: s(r, "reason"),
      requestedBy: s(r, "requested_by"), providerRefundId: r.provider_refund_id === null ? null : s(r, "provider_refund_id"), createdAt: d(r, "created_at")!,
    })),
    events: events.map((e) => ({ from: e.from_status === null ? null : s(e, "from_status"), to: s(e, "to_status"), actor: s(e, "actor"), reason: e.reason === null ? null : s(e, "reason"), at: d(e, "at")! })),
    audit: audit.map((a) => ({ actor: s(a, "actor"), action: s(a, "action"), reason: a.reason === null ? null : s(a, "reason"), at: d(a, "at")! })),
    invoices,
    parcels,
    returns,
    failedMails: failedMails.map((x) => ({ id: n(x, "id"), kind: s(x, "kind"), error: s(x, "last_error") })),
    purchases: purchases.map((p) => ({
      ...p,
      events: purchaseEvents.filter((e) => e.supplier_order_id === p.id).map((e) => ({ to: s(e, "to_status"), actor: s(e, "actor"), reason: e.reason === null ? null : s(e, "reason"), at: d(e, "at")! })),
    })),
  };
}

/** Purchase orders that wait to be sent: shown with "inkopen staat uit" while SUPPLIER_ORDERING is off. */
export async function waitingPurchases(db: Queryable): Promise<number> {
  const [row] = await selectRows<{ n: number | string }>(db, "SELECT COUNT(*) AS n FROM supplier_orders WHERE status = 'DRAFT'");
  return Number(row?.n ?? 0);
}

export const latestOrders = async (db: Queryable, limit = 5): Promise<OrderListRow[]> =>
  (await selectRows<RawListRow>(db, `SELECT ${LIST_COLUMNS} FROM orders ORDER BY id DESC LIMIT ?`, [limit])).flatMap(toListRow);
