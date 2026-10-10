// The order state machine (docs/STATE_MACHINES.md § Order). A transition that
// is not in this table does not exist. Pure: the database side is in
// ./store.ts, which asks this table before every change.

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAYMENT_FAILED",
  "CANCELLED",
  "PAID",
  "FULFILLMENT_PENDING",
  "PURCHASED",
  "PARTIALLY_FULFILLED",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ACTORS = ["customer", "admin", "system", "provider", "reconciliation"] as const;
export type Actor = (typeof ACTORS)[number];

export const TERMINAL: readonly OrderStatus[] = ["CANCELLED", "COMPLETED"];

/** How long a frozen order may be paid (owner, 2026-10-10). */
export const SNAPSHOT_VALID_MS = 60 * 60_000;
/** The customer's own cancel window after payment (D-04, owner 2026-10-10). */
export const CANCEL_WINDOW_MS = 30 * 60_000;

type Rule = { from: readonly OrderStatus[]; to: OrderStatus; actors: readonly Actor[] };

/**
 * The (from, to, actor) pairs of docs/STATE_MACHINES.md § Transities. The
 * conditions in that table (payment confirmed, refund requested, snapshot
 * valid) are checked by the function that makes the transition; this table
 * only says whether the pair exists.
 */
const RULES: readonly Rule[] = [
  { from: ["PENDING_PAYMENT"], to: "PAID", actors: ["provider", "reconciliation", "system"] },
  { from: ["PENDING_PAYMENT"], to: "PAYMENT_FAILED", actors: ["provider", "reconciliation"] },
  { from: ["PAYMENT_FAILED"], to: "PENDING_PAYMENT", actors: ["customer"] },
  { from: ["PENDING_PAYMENT", "PAYMENT_FAILED"], to: "CANCELLED", actors: ["system", "customer"] },
  // After the cancel window (D-04): purchasing starts.
  { from: ["PAID"], to: "FULFILLMENT_PENDING", actors: ["admin", "system"] },
  // Inside the window the customer may cancel (D-04, 2026-10-10); always with a full refund.
  { from: ["PAID"], to: "CANCELLED", actors: ["admin", "customer"] },
  { from: ["FULFILLMENT_PENDING"], to: "CANCELLED", actors: ["admin"] },
  { from: ["FULFILLMENT_PENDING"], to: "PURCHASED", actors: ["admin", "system"] },
  { from: ["FULFILLMENT_PENDING", "PURCHASED"], to: "PARTIALLY_FULFILLED", actors: ["admin", "system"] },
  { from: ["PURCHASED", "PARTIALLY_FULFILLED"], to: "SHIPPED", actors: ["admin", "provider"] },
  { from: ["SHIPPED"], to: "DELIVERED", actors: ["admin", "provider", "system"] },
  { from: ["DELIVERED"], to: "COMPLETED", actors: ["system"] },
];

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Whether `actor` may move an order from `from` to `to`. */
export function canTransition(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  return RULES.some((r) => r.to === to && r.from.includes(from) && r.actors.includes(actor));
}

/** A hold (AMOUNT_MISMATCH, FRAUD_REVIEW, …) blocks every transition away from PAID. */
export function blockedByHold(from: OrderStatus, holdReason: string | null): boolean {
  return from === "PAID" && holdReason !== null;
}

/**
 * The side effects of entering a status, written to the outbox in the same
 * transaction (docs/STATE_MACHINES.md § Transities, D-21: the confirmation at
 * payment, the invoice when the window closes and purchasing starts).
 */
export const EFFECTS: Partial<Record<OrderStatus, readonly string[]>> = {
  PAID: ["order-confirmation", "admin-new-order"],
  FULFILLMENT_PENDING: ["supplier-order", "invoice"],
  CANCELLED: ["order-cancelled"],
};

/** Whether the customer may still cancel or change their details (D-04). */
export function insideCancelWindow(status: OrderStatus, holdReason: string | null, windowEndsAt: Date | null, now: Date): boolean {
  return status === "PAID" && holdReason === null && windowEndsAt !== null && now.getTime() < windowEndsAt.getTime();
}
