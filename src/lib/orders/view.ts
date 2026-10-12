// An order as the customer sees it on the status page (docs/SCHERMEN.md §
// Bevestiging en status): the frozen lines and amounts, what happens next,
// what they may still do. Never the purchase price (D-16). Server-side only.

import { fromDbTime, selectRows, type Queryable } from "@/lib/db";
import type { Locale } from "@/lib/i18n/config";
import { money, type Money } from "@/lib/money";
import type { PaymentStatus, RefundStatus } from "@/lib/payments/states";
import type { CustomerDetails } from "./customer";
import { insideCancelWindow, isOrderStatus, type OrderStatus } from "./states";

export type OrderView = {
  reference: string;
  status: OrderStatus;
  onHold: boolean;
  locale: Locale;
  createdAt: Date;
  paidAt: Date | null;
  snapshotExpiresAt: Date;
  cancelWindowEndsAt: Date | null;
  /** The customer may still cancel or change their details (D-04). */
  canChange: boolean;
  /** Not paid yet and still payable: a payment can (again) be started. */
  canPay: boolean;
  /** The last payment attempt, if any. */
  payment: PaymentStatus | null;
  refunds: { status: RefundStatus; amount: Money }[];
  customer: CustomerDetails;
  lines: { name: string; sku: string; quantity: number; unitPrice: Money; lineTotal: Money; largeShipping: Money | null }[];
  subtotal: Money;
  shippingStandard: Money;
  shippingLarge: Money;
  total: Money;
  delivery: { minWorkingDays: number; maxWorkingDays: number; shipsFrom: string[] };
};

export async function readOrderView(db: Queryable, orderId: number, now: Date = new Date()): Promise<OrderView | null> {
  const [o] = await selectRows<Record<string, string | number | null>>(
    db,
    `SELECT reference, status, hold_reason, locale, created_at, paid_at, snapshot_expires_at, cancel_window_ends_at,
            email, phone, first_name, last_name, street, house_number, postcode, city, country,
            subtotal_cents, shipping_standard_cents, shipping_large_cents, total_cents
       FROM orders WHERE id = ?`,
    [orderId],
  );
  if (!o || typeof o.status !== "string" || !isOrderStatus(o.status)) return null;
  const lines = await selectRows<Record<string, string | number | null>>(
    db,
    "SELECT name, sku, quantity, unit_price_cents, line_total_cents, large_shipping_cents, min_days, max_days, ships_from FROM order_lines WHERE order_id = ? ORDER BY line_no",
    [orderId],
  );
  const [payment] = await selectRows<{ status: string }>(db, "SELECT status FROM payments WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT 1", [orderId]);
  const refunds = await selectRows<{ status: string; amount_cents: number | string }>(db, "SELECT status, amount_cents FROM refunds WHERE order_id = ? ORDER BY created_at", [orderId]);

  const status = o.status;
  const holdReason = (o.hold_reason as string | null) ?? null;
  const windowEnds = o.cancel_window_ends_at ? fromDbTime(String(o.cancel_window_ends_at)) : null;
  const expires = fromDbTime(String(o.snapshot_expires_at));
  const str = (k: string) => String(o[k] ?? "");
  return {
    reference: str("reference"),
    status,
    onHold: holdReason !== null,
    locale: o.locale === "en" ? "en" : "nl",
    createdAt: fromDbTime(str("created_at")),
    paidAt: o.paid_at ? fromDbTime(String(o.paid_at)) : null,
    snapshotExpiresAt: expires,
    cancelWindowEndsAt: windowEnds,
    canChange: insideCancelWindow(status, holdReason, windowEnds, now),
    canPay: (status === "PENDING_PAYMENT" || status === "PAYMENT_FAILED") && holdReason === null && now < expires,
    payment: (payment?.status as PaymentStatus | undefined) ?? null,
    refunds: refunds.map((r) => ({ status: r.status as RefundStatus, amount: money(Number(r.amount_cents)) })),
    customer: {
      email: str("email"), phone: str("phone"), firstName: str("first_name"), lastName: str("last_name"),
      street: str("street"), houseNumber: str("house_number"), postcode: str("postcode"), city: str("city"), country: "NL",
    },
    lines: lines.map((l) => ({
      name: String(l.name),
      sku: String(l.sku),
      quantity: Number(l.quantity),
      unitPrice: money(Number(l.unit_price_cents)),
      lineTotal: money(Number(l.line_total_cents)),
      largeShipping: l.large_shipping_cents === null ? null : money(Number(l.large_shipping_cents)),
    })),
    subtotal: money(Number(o.subtotal_cents)),
    shippingStandard: money(Number(o.shipping_standard_cents)),
    shippingLarge: money(Number(o.shipping_large_cents)),
    total: money(Number(o.total_cents)),
    delivery: {
      minWorkingDays: Math.max(0, ...lines.map((l) => Number(l.min_days))),
      maxWorkingDays: Math.max(0, ...lines.map((l) => Number(l.max_days))),
      shipsFrom: [...new Set(lines.map((l) => String(l.ships_from)))],
    },
  };
}
