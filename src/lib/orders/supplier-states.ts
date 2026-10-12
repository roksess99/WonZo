// The purchase order at the supplier (docs/STATE_MACHINES.md § Supplier
// order). WonZo purchases automatically (D-04): the code moves it, through
// this table. Pure: the database side is in ./purchasing.ts.

export const SUPPLIER_ORDER_STATUSES = ["DRAFT", "SUBMITTING", "UNKNOWN", "PLACED", "REJECTED", "PARTIALLY_SHIPPED", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
export type SupplierOrderStatus = (typeof SUPPLIER_ORDER_STATUSES)[number];
export type SupplierActor = "system" | "admin" | "reconciliation" | "provider";

/** The supplier has (or may have) the order: cancelling ours can no longer be done by us alone (D-04: BigBuy has no cancel call). */
export const AT_SUPPLIER: readonly SupplierOrderStatus[] = ["SUBMITTING", "UNKNOWN", "PLACED", "PARTIALLY_SHIPPED", "SHIPPED", "DELIVERED"];

/** D-04 (owner, 2026-10-10): a refusal is tried again for 24 hours, with the same own reference. */
export const RETRY_FOR_MS = 24 * 3_600_000;
/** How long between two tries: often enough that a top-up of the balance is picked up soon. */
export const RETRY_EVERY_MS = 30 * 60_000;
/** D-04 (owner, 2026-10-10): up to 10 % above the frozen purchase price is still ordered. */
export const MAX_PRICE_INCREASE_PERCENT = 10;

type Rule = { from: readonly SupplierOrderStatus[]; to: SupplierOrderStatus; actors: readonly SupplierActor[] };

const RULES: readonly Rule[] = [
  { from: ["DRAFT"], to: "SUBMITTING", actors: ["system"] },
  { from: ["SUBMITTING"], to: "PLACED", actors: ["system"] },
  { from: ["SUBMITTING"], to: "REJECTED", actors: ["system"] },
  { from: ["SUBMITTING"], to: "UNKNOWN", actors: ["system"] },
  // Only after asking the supplier by our own reference — never by sending again.
  { from: ["UNKNOWN"], to: "PLACED", actors: ["reconciliation", "admin"] },
  { from: ["UNKNOWN"], to: "REJECTED", actors: ["reconciliation", "admin"] },
  // D-04: a refusal (most likely too little balance) is tried again with the same reference,
  // by the code for 24 hours, after that only when the owner chooses it. Safe: a refused
  // order was not created, and the supplier is asked by the reference first.
  { from: ["REJECTED"], to: "SUBMITTING", actors: ["system", "admin"] },
  { from: ["PLACED"], to: "PARTIALLY_SHIPPED", actors: ["admin", "provider"] },
  { from: ["PLACED", "PARTIALLY_SHIPPED"], to: "SHIPPED", actors: ["admin", "provider"] },
  { from: ["SHIPPED"], to: "DELIVERED", actors: ["admin", "provider", "system"] },
  // Our order is cancelled before anything reached the supplier.
  { from: ["DRAFT", "REJECTED"], to: "CANCELLED", actors: ["admin", "system"] },
];

export function isSupplierOrderStatus(x: string): x is SupplierOrderStatus {
  return (SUPPLIER_ORDER_STATUSES as readonly string[]).includes(x);
}

export function canTransitionSupplierOrder(from: SupplierOrderStatus, to: SupplierOrderStatus, actor: SupplierActor): boolean {
  return RULES.some((r) => r.to === to && r.from.includes(from) && r.actors.includes(actor));
}

/**
 * Whether the supplier's price may be ordered without the owner: at most
 * 10 % above what was frozen (D-04). Integer cents on both sides, so the
 * comparison is exact: actual × 100 ≤ expected × 110.
 */
export function priceAcceptable(expectedCents: number, actualCents: number): boolean {
  return actualCents * 100 <= expectedCents * (100 + MAX_PRICE_INCREASE_PERCENT);
}

/** How much higher, in whole percents, rounded down (a shown percentage is never more than it is). */
export function increasePercent(expectedCents: number, actualCents: number): number {
  if (expectedCents <= 0) return 0;
  return Math.max(0, Math.floor(((actualCents - expectedCents) * 100) / expectedCents));
}
