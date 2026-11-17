// What a return gives back at most (docs/RETOUREN.md § De vier redenen, D-09
// owner 2026-10-13). Pure and without I/O: the return form shows the amount
// live with this function, and the server computes it again with the same
// function from the frozen order lines (.claude/rules/geld.md: the amount the
// customer sees and the amount the server pays come from one function).
//
// - The returned pieces at their frozen price per piece (incl. VAT).
// - The normal shipping only when this return makes the whole order come
//   back (`WETTELIJK`: a partial withdrawal keeps the shipping, to be confirmed).
// - The own shipping of a large item (D-13) per returned piece when the
//   shop is at fault (wrong, damaged, defect), or when the whole order comes
//   back — then also what earlier returns did not give back.
// - Withdrawing without a reason: within 14 days of the delivery, or before
//   the delivery is known. Wrong, damaged or defect: no such window (legal
//   guarantee); the admin judges.
//
// The return label is in the parcel (owner 2026-10-13): the customer never
// pays for sending it back, so nothing is deducted for that.

import { money, type Money } from "@/lib/money";

export const RETURN_REASONS = ["none", "wrong", "damaged", "defect"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export const isReturnReason = (x: unknown): x is ReturnReason => typeof x === "string" && (RETURN_REASONS as readonly string[]).includes(x);

/** The shop's fault: shipping of a large item back, and no 14-day window. */
export const SHOP_FAULT: readonly ReturnReason[] = ["wrong", "damaged", "defect"];

/** `WETTELIJK` (BW 6:230o, to be confirmed): 14 days from receipt. */
export const WITHDRAWAL_DAYS = 14;
const DAY_MS = 86_400_000;

export type ReturnableLine = {
  lineNo: number;
  /** Bought, and already in an earlier return that was not refused. */
  bought: number;
  returned: number;
  unitPrice: Money;
  /** Own shipping per piece of a large item (D-13), or null. */
  largeShipping: Money | null;
};

export type ReturnableOrder = {
  lines: ReturnableLine[];
  shippingStandard: Money;
  /** Shipping that earlier returns of this order already count (only large-item shipping: the normal one goes with the last). */
  earlierShipping: Money;
  /** When the parcel arrived; null while that is not known. */
  deliveredAt: Date | null;
};

export type ReturnRequestLine = { lineNo: number; quantity: number; reason: ReturnReason };

export type ReturnLineError = "quantity" | "reason" | "window";

export type ReturnQuote =
  | { ok: true; lines: Money; shipping: Money; total: Money; wholeOrder: boolean }
  | { ok: false; error: "empty" | "lines"; lines: Record<number, ReturnLineError> };

/**
 * An amount the admin typed, "12,50" or "12.50" or "12", to cents — exactly,
 * without a float. Anything else (a minus, three decimals, letters) is null:
 * refused, never guessed or cut off (.claude/rules/geld.md § Buiten bereik).
 */
export function parseEuroInput(x: unknown): number | null {
  if (typeof x !== "string") return null;
  const m = /^\s*(?:€\s*)?(\d{1,7})(?:[.,](\d{1,2}))?\s*$/.exec(x);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** Until when the customer may withdraw without a reason; null while the delivery is not known (then: open). */
export function withdrawalEndsAt(deliveredAt: Date | null): Date | null {
  return deliveredAt ? new Date(deliveredAt.getTime() + WITHDRAWAL_DAYS * DAY_MS) : null;
}

export function withdrawalOpen(deliveredAt: Date | null, now: Date): boolean {
  const ends = withdrawalEndsAt(deliveredAt);
  return ends === null || now.getTime() <= ends.getTime();
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/**
 * The amount for these lines, or why not. Out of range is refused, never cut
 * off (.claude/rules/geld.md § Buiten bereik): 0 pieces is "not returned",
 * not a line; more than can still be returned is an error.
 */
export function quoteReturn(order: ReturnableOrder, request: ReturnRequestLine[], now: Date): ReturnQuote {
  const chosen = request.filter((r) => r.quantity !== 0);
  if (!chosen.length) return { ok: false, error: "empty", lines: {} };
  const errors: Record<number, ReturnLineError> = {};
  const seen = new Set<number>();
  for (const r of chosen) {
    const line = order.lines.find((l) => l.lineNo === r.lineNo);
    if (!line || seen.has(r.lineNo) || !Number.isSafeInteger(r.quantity) || r.quantity < 1 || r.quantity > line.bought - line.returned) errors[r.lineNo] = "quantity";
    else if (!isReturnReason(r.reason)) errors[r.lineNo] = "reason";
    else if (r.reason === "none" && !withdrawalOpen(order.deliveredAt, now)) errors[r.lineNo] = "window";
    seen.add(r.lineNo);
  }
  if (Object.keys(errors).length) return { ok: false, error: "lines", lines: errors };

  const currency = order.shippingStandard.currency;
  const pieces = (lineNo: number) => chosen.find((r) => r.lineNo === lineNo)?.quantity ?? 0;
  const wholeOrder = order.lines.every((l) => l.returned + pieces(l.lineNo) === l.bought);
  const lines = sum(chosen.map((r) => order.lines.find((l) => l.lineNo === r.lineNo)!.unitPrice.amount * r.quantity));
  let shipping: number;
  if (wholeOrder) {
    // Everything comes back: all shipping of the order, less what earlier returns already count.
    const allLarge = sum(order.lines.map((l) => (l.largeShipping?.amount ?? 0) * l.bought));
    shipping = order.shippingStandard.amount + allLarge - order.earlierShipping.amount;
  } else {
    shipping = sum(chosen.filter((r) => SHOP_FAULT.includes(r.reason)).map((r) => (order.lines.find((l) => l.lineNo === r.lineNo)!.largeShipping?.amount ?? 0) * r.quantity));
  }
  // A negative amount can only be a bug in the data (more counted earlier than there was): stop.
  if (lines < 0 || shipping < 0) throw new Error("return amount below zero");
  return { ok: true, lines: money(lines, currency), shipping: money(shipping, currency), total: money(lines + shipping, currency), wholeOrder };
}
