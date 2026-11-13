// What the owner types in the price and discount forms, read the same way in
// the browser (to show the change before saving) and on the server (which
// decides). Pure. Out of range is the caller's to refuse, never to clip
// (.claude/rules/geld.md § Buiten bereik).

/** "12", "12,5", "12.50" or "12 %" → basis points; "" → null; anything else → undefined. */
export function parsePercent(x: unknown): number | null | undefined {
  if (x === null || x === undefined) return null;
  if (typeof x !== "string") return undefined;
  const t = x.trim().replace(/\s*%$/, "");
  if (t === "") return null;
  const m = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(t);
  if (!m) return undefined;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** "0,32" or "0.32" euro → cents; anything not a plain, non-negative amount → undefined. */
export function parseEuro(x: unknown): number | undefined {
  if (typeof x !== "string") return undefined;
  const m = /^\s*(\d{1,6})(?:[.,](\d{1,2}))?\s*$/.exec(x);
  if (!m) return undefined;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** Basis points as the form shows them: 1250 → "12,5"; null → "". */
export const percentText = (bp: number | null) => (bp === null ? "" : new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2, useGrouping: false }).format(bp / 100));

/** Cents as the form shows them: 32 → "0,32". */
export const euroText = (cents: number) => new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(cents / 100);
