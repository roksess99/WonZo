// Discount codes (docs/PRIJZEN.md § 3, D-08, D-15). Pure: the cart page, the
// checkout and the order all apply a code with this one function, with
// amounts the server looked up itself.
//
// - A code is a percentage over the order, never over shipping.
// - It does not count lines that already have a promotion: otherwise it
//   stacks on a discount that already ate the margin (§ 3, rule 1).
// - The minimum looks at the products (all of them), not at shipping.
// - The amount is spread over the lines it applies to before VAT is taken
//   out (D-15, user 2026-11-02): in proportion to the line totals, each share
//   rounded down, the cents left over one by one to the largest remainder, on
//   a tie the first line. A line never goes below its floor (D-16): a share
//   that would is cut to what the floor allows, and the code says so.
// - Free shipping looks at the subtotal before the code: a code may never
//   make an order more expensive (§ 3), and for a code that only lowers the
//   subtotal that is the same thing.

import type { Money } from "@/lib/money";

/** "WELKOM10": letters, digits and dashes, 3 to 32, compared in capitals. */
const CODE = /^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$/;

/** The code as the customer typed it, normalised; null when it cannot be a code (then: unknown). */
export function normalizeCode(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const c = text.trim().toUpperCase();
  return CODE.test(c) ? c : null;
}

export type DiscountCode = {
  id: string;
  code: string;
  percentBp: number;
  /** Products subtotal incl. VAT the order needs; 0 for none. */
  minSubtotalCents: number;
};

/**
 * Why a code does not apply. "unknown" also covers a code that has not
 * started yet: it does not tell what is coming. "try-later": too many
 * lookups from this visitor (the rate limit against guessing), or the
 * database out of reach for a moment.
 */
export type CodeRefusal = "unknown" | "ended" | "exhausted" | "used" | "min-subtotal" | "promoted-only" | "try-later";

/** What the server knows about the code text before it looks at the cart. */
export type CodeLookup = { kind: "ok"; code: DiscountCode } | { kind: "refused"; code: string; reason: Exclude<CodeRefusal, "min-subtotal" | "promoted-only"> };

export type CodeLine = {
  lineTotal: Money;
  /** The line already has a promotion: the code does not count it. */
  promoted: boolean;
  /** What the floor (D-16) leaves for a discount on this whole line, ≥ 0. */
  room: number;
};

export type CodeOutcome =
  | {
      kind: "applied";
      code: string;
      codeId: string;
      percentBp: number;
      /** What the customer gets, after the floor. */
      discount: Money;
      /** Per line, in the order of the lines (0 where it does not apply). */
      perLine: number[];
      /** The floor took part of it. */
      limited: boolean;
      /** Some lines did not count because they have a promotion. */
      skippedPromoted: boolean;
    }
  | { kind: "refused"; code: string; reason: CodeRefusal; minSubtotal?: Money };

/**
 * `total` over `weights` (D-15): each share rounded down, then one cent at a
 * time to the largest remainder, on a tie the earliest. Sums to `total`
 * exactly. Weights are non-negative integers with a positive sum.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!Number.isSafeInteger(total) || total < 0 || sum <= 0 || weights.some((w) => !Number.isSafeInteger(w) || w < 0)) throw new Error(`allocate: ${total} over ${weights.join(",")}`);
  // BigInt: total × weight can pass 2^53 for large orders.
  const shares = weights.map((w) => Number((BigInt(total) * BigInt(w)) / BigInt(sum)));
  const rest = weights.map((w) => Number((BigInt(total) * BigInt(w)) % BigInt(sum)));
  let left = total - shares.reduce((s, x) => s + x, 0);
  const order = weights.map((_, i) => i).sort((a, b) => rest[b]! - rest[a]! || a - b);
  for (const i of order) {
    if (left === 0) break;
    shares[i]! += 1;
    left -= 1;
  }
  return shares;
}

/** base × bp / 10 000, rounded half up to a cent, once. */
const percentOf = (base: number, bp: number) => Math.floor((2 * base * bp + 10_000) / 20_000);

/** Applies a looked-up code to the priced lines. */
export function applyCode(lookup: CodeLookup, lines: CodeLine[], subtotal: Money): CodeOutcome {
  if (lookup.kind === "refused") return { kind: "refused", code: lookup.code, reason: lookup.reason };
  const c = lookup.code;
  const currency = subtotal.currency;
  if (subtotal.amount < c.minSubtotalCents) return { kind: "refused", code: c.code, reason: "min-subtotal", minSubtotal: { amount: c.minSubtotalCents, currency } };
  const weights = lines.map((l) => (l.promoted ? 0 : l.lineTotal.amount));
  const base = weights.reduce((s, w) => s + w, 0);
  if (base === 0) return { kind: "refused", code: c.code, reason: "promoted-only" };

  const asked = percentOf(base, c.percentBp);
  const shares = allocate(asked, weights);
  // Never below the floor: a share is cut to the room of its line, and what is cut is not moved to another line
  // (no line gets more than the code's percentage of it).
  const perLine = shares.map((s, i) => Math.min(s, Math.max(0, lines[i]!.room)));
  const discount = perLine.reduce((s, x) => s + x, 0);
  return {
    kind: "applied",
    code: c.code,
    codeId: c.id,
    percentBp: c.percentBp,
    discount: { amount: discount, currency },
    perLine,
    limited: discount < asked,
    skippedPromoted: lines.some((l) => l.promoted),
  };
}

/**
 * The code's share of `pieces` pieces coming back from a line that already
 * returned `before` (D-15 again, per piece): cumulative and rounded down, so
 * the shares of every return of a line add up to its whole discount — never
 * more, never twice.
 */
export function returnedShare(lineDiscount: number, quantity: number, before: number, pieces: number): number {
  if (lineDiscount === 0) return 0;
  const upTo = (k: number) => Math.floor((lineDiscount * k) / quantity);
  return upTo(before + pieces) - upTo(before);
}
