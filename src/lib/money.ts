// Money as integer minor units with a currency (.claude/rules/geld.md).
// Never a float, never a bare number that "will be euros".

export type Currency = "EUR";

export type Money = {
  /** Integer, minor units (cents). */
  amount: number;
  currency: Currency;
};

export class MoneyError extends Error {}

const DECIMAL = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/;

/**
 * Exact conversion of a supplier amount ("18.22", 18.22, "18,2") to cents.
 * Goes through the decimal string, never through `value * 100`: 1.15 * 100
 * is 114.99999999999999 in floating point.
 */
export function fromDecimal(value: number | string, currency: Currency = "EUR"): Money {
  const text = typeof value === "number" ? numberToPlainString(value) : value.trim();
  const m = DECIMAL.exec(text);
  if (!m) throw new MoneyError(`Not an amount with at most two decimals: ${JSON.stringify(value)}`);
  const [, sign, whole, fraction = ""] = m;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new MoneyError(`Amount out of range: ${JSON.stringify(value)}`);
  return { amount: sign === "-" ? -cents : cents, currency };
}

/** `String(n)` without exponent notation; JSON numbers like 18.22 round-trip exactly. */
function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) throw new MoneyError(`Not a finite number: ${n}`);
  const s = String(n);
  if (!/e/i.test(s)) return s;
  // Only reached for tiny or huge values, which are not prices.
  throw new MoneyError(`Unexpected amount: ${s}`);
}

export function money(amount: number, currency: Currency = "EUR"): Money {
  if (!Number.isSafeInteger(amount)) throw new MoneyError(`Amount must be an integer in minor units: ${amount}`);
  return { amount, currency };
}

export function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new MoneyError(`Cannot add ${a.currency} and ${b.currency}`);
  return money(a.amount + b.amount, a.currency);
}

/** A unit price times a quantity; the quantity must be a whole number. */
export function multiply(m: Money, factor: number): Money {
  if (!Number.isSafeInteger(factor)) throw new MoneyError(`Factor must be an integer: ${factor}`);
  return money(m.amount * factor, m.currency);
}

export function subtract(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new MoneyError(`Cannot subtract ${b.currency} from ${a.currency}`);
  return money(a.amount - b.amount, a.currency);
}

export function compare(a: Money, b: Money): number {
  if (a.currency !== b.currency) throw new MoneyError(`Cannot compare ${a.currency} and ${b.currency}`);
  return a.amount - b.amount;
}

// Dutch notation on every page, also the English ones (D-14): "€ 49,95".
const formatter = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

export function formatMoney(m: Money): string {
  return formatter.format(m.amount / 100);
}

const wholeFormatter = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** For round amounts in running text ("gratis vanaf € 50"); anything with cents keeps them. */
export function formatMoneyShort(m: Money): string {
  return m.amount % 100 === 0 ? wholeFormatter.format(m.amount / 100) : formatMoney(m);
}
