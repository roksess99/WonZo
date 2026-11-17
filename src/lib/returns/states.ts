// The return state machine (docs/STATE_MACHINES.md § Return). A transition
// that is not in this table does not exist. Pure: the database side is in
// ./index.ts, which asks this table before every change.

export const RETURN_STATUSES = ["REQUESTED", "RECEIVED", "REJECTED", "REFUNDING", "REFUNDED", "WITHDRAWN"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export type ReturnActor = "customer" | "admin" | "system";

/** Closed: a new return for the order may be made. */
export const RETURN_CLOSED: readonly ReturnStatus[] = ["REJECTED", "REFUNDED", "WITHDRAWN"];

type Rule = { from: readonly ReturnStatus[]; to: ReturnStatus; actors: readonly ReturnActor[] };

const RULES: readonly Rule[] = [
  { from: ["REQUESTED"], to: "RECEIVED", actors: ["admin"] },
  { from: ["REQUESTED", "RECEIVED"], to: "REJECTED", actors: ["admin"] },
  { from: ["REQUESTED"], to: "WITHDRAWN", actors: ["customer", "admin"] },
  // D-09 (owner 2026-10-12): the admin judges the returned product first, then pays back.
  { from: ["RECEIVED"], to: "REFUNDING", actors: ["admin"] },
  { from: ["REFUNDING"], to: "REFUNDED", actors: ["system"] },
  // The refund failed: back to where it came from, with an alert (D-30 point 3).
  { from: ["REFUNDING"], to: "RECEIVED", actors: ["system"] },
];

export function isReturnStatus(x: string): x is ReturnStatus {
  return (RETURN_STATUSES as readonly string[]).includes(x);
}

export function canTransitionReturn(from: ReturnStatus, to: ReturnStatus, actor: ReturnActor): boolean {
  return RULES.some((r) => r.to === to && r.from.includes(from) && r.actors.includes(actor));
}

/** The order statuses a return can be asked for: invoiced (after the window) and not cancelled (D-21, D-09). */
export const RETURNABLE_ORDER_STATUSES = ["FULFILLMENT_PENDING", "PURCHASED", "PARTIALLY_FULFILLED", "SHIPPED", "DELIVERED", "COMPLETED"] as const;
