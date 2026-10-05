// The cart holds references only: which product, from which source, how many
// (CLAUDE.md § Bouwvolgorde, fase 2). Never a price, name or stock — those are
// looked up on the server for every view, so a changed browser storage cannot
// change what anything costs (docs/THREAT_MODEL.md § Prijsmanipulatie).
// Pure: used by the browser store and by the quote endpoint alike.

export type CartSource = "bigbuy";

export type CartLine = {
  source: CartSource;
  /** The supplier's product id (.claude/rules/catalogus.md § Identiteit). */
  productId: string;
  /** Whole number, at least 1. */
  quantity: number;
};

// Technical bounds on what the browser may send, so a request stays small.
// Not a shop policy: the real limit on a quantity is the stock of the offer.
export const MAX_LINES = 50;
export const MAX_QUANTITY = 999;

const SOURCES: readonly CartSource[] = ["bigbuy"];
const PRODUCT_ID = /^\d{1,12}$/;

export type LineError = "shape" | "source" | "productId" | "quantity";

/** Checks one line from outside; returns the reason when it is not valid. */
export function checkLine(input: unknown): { ok: true; line: CartLine } | { ok: false; error: LineError } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, error: "shape" };
  const { source, productId, quantity } = input as Record<string, unknown>;
  if (typeof source !== "string" || !SOURCES.includes(source as CartSource)) return { ok: false, error: "source" };
  if (typeof productId !== "string" || !PRODUCT_ID.test(productId)) return { ok: false, error: "productId" };
  // Out of range is refused, never clamped (.claude/rules/geld.md § Buiten bereik).
  if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return { ok: false, error: "quantity" };
  }
  return { ok: true, line: { source: source as CartSource, productId, quantity } };
}

const sameProduct = (a: Pick<CartLine, "source" | "productId">, b: Pick<CartLine, "source" | "productId">) =>
  a.source === b.source && a.productId === b.productId;

/**
 * What the browser has stored, made usable. Storage can hold anything (an old
 * version, a hand edit, a half write), and the visitor must never be stuck on
 * it: invalid lines are dropped, duplicates merged. The server checks again.
 */
export function readStoredCart(input: unknown): CartLine[] {
  const raw = typeof input === "object" && input !== null && (input as { version?: unknown }).version === 1 ? (input as { lines?: unknown }).lines : null;
  if (!Array.isArray(raw)) return [];
  let lines: CartLine[] = [];
  for (const item of raw.slice(0, MAX_LINES)) {
    const checked = checkLine(item);
    if (checked.ok) lines = addLine(lines, checked.line, Infinity).lines;
  }
  return lines;
}

export function storedForm(lines: CartLine[]) {
  return { version: 1 as const, lines };
}

export type AddResult =
  | { lines: CartLine[]; added: true; inCart: number }
  | { lines: CartLine[]; added: false; inCart: number; reason: "stock" | "full" };

/**
 * Adds a quantity to the cart. Refused (not trimmed) when the total would pass
 * the stock the visitor saw or the technical bound; `inCart` says how many are
 * already there, so the screen can explain.
 */
export function addLine(lines: CartLine[], line: CartLine, stock: number): AddResult {
  const existing = lines.find((l) => sameProduct(l, line));
  const inCart = existing?.quantity ?? 0;
  const next = inCart + line.quantity;
  if (next > Math.min(stock, MAX_QUANTITY)) return { lines, added: false, inCart, reason: "stock" };
  if (!existing && lines.length >= MAX_LINES) return { lines, added: false, inCart, reason: "full" };
  const updated = existing
    ? lines.map((l) => (sameProduct(l, line) ? { ...l, quantity: next } : l))
    : [...lines, line];
  return { lines: updated, added: true, inCart };
}

/** Sets a quantity; a value outside 1–MAX_QUANTITY is refused and nothing changes. */
export function setQuantity(lines: CartLine[], ref: Pick<CartLine, "source" | "productId">, quantity: number): CartLine[] {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return lines;
  return lines.map((l) => (sameProduct(l, ref) ? { ...l, quantity } : l));
}

export function removeLine(lines: CartLine[], ref: Pick<CartLine, "source" | "productId">): CartLine[] {
  return lines.filter((l) => !sameProduct(l, ref));
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}
