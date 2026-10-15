// VAT, one function everywhere (D-15, owner 2026-10-12: VAT per product,
// then the totals including and excluding VAT; to be confirmed by the
// bookkeeper). The source is gross (prices include VAT, .claude/rules/geld.md
// § Rekenen), so VAT is taken out of the gross line total once, rounded half
// up to a cent: excl = round(incl × 10 000 / (10 000 + rate)), VAT = incl −
// excl. Per line total, not per piece × quantity: 4 × € 2,97 = € 11,88 incl.
// gives € 9,82 excl. (not 4 × € 2,45 = € 9,80). Shipping gets the rate of the
// products; with more than one rate that is still open (D-15) and refused.
// Pure: order page, mail and invoice all call this.

import { money, type Money } from "@/lib/money";

export class MixedVatShipping extends Error {
  constructor() {
    super("D-15: VAT on shipping with more than one rate in the order is not decided yet");
  }
}

/** The excluding-VAT part of a gross amount, rounded half up (away from zero for a credit). */
export function exclusive(incl: number, rateBp: number): number {
  if (!Number.isSafeInteger(incl) || !Number.isSafeInteger(rateBp) || rateBp < 0) throw new Error(`Not an amount and rate: ${incl}, ${rateBp}`);
  const d = 10_000 + rateBp;
  const abs = Math.floor((2 * Math.abs(incl) * 10_000 + d) / (2 * d));
  return incl < 0 ? -abs : abs;
}

export type VatInputLine = { quantity: number; unitPrice: Money; lineTotal: Money; vatRateBp: number };

export type VatLine = { unitExcl: Money; unitIncl: Money; totalExcl: Money; totalIncl: Money; vat: Money; vatRateBp: number };

export type VatBreakdown = {
  lines: VatLine[];
  shipping: { excl: Money; incl: Money; vat: Money; vatRateBp: number } | null;
  /** Per rate: the base excluding VAT and the VAT — what the invoice and the return ask for (art. 35a Wet OB). */
  byRate: { vatRateBp: number; base: Money; vat: Money }[];
  totalExcl: Money;
  totalVat: Money;
  totalIncl: Money;
};

export function vatBreakdown(lines: VatInputLine[], shippingIncl: Money): VatBreakdown {
  const out: VatLine[] = lines.map((l) => {
    const totalExcl = exclusive(l.lineTotal.amount, l.vatRateBp);
    return {
      unitIncl: l.unitPrice,
      unitExcl: money(exclusive(l.unitPrice.amount, l.vatRateBp)),
      totalIncl: l.lineTotal,
      totalExcl: money(totalExcl),
      vat: money(l.lineTotal.amount - totalExcl),
      vatRateBp: l.vatRateBp,
    };
  });
  const rates = [...new Set(lines.map((l) => l.vatRateBp))].sort((a, b) => b - a);
  let shipping: VatBreakdown["shipping"] = null;
  if (shippingIncl.amount !== 0) {
    if (rates.length !== 1) throw new MixedVatShipping();
    const excl = exclusive(shippingIncl.amount, rates[0]!);
    shipping = { incl: shippingIncl, excl: money(excl), vat: money(shippingIncl.amount - excl), vatRateBp: rates[0]! };
  }
  const byRate = rates.map((rate) => {
    const ofRate = out.filter((l) => l.vatRateBp === rate);
    const base = ofRate.reduce((s, l) => s + l.totalExcl.amount, 0) + (shipping?.vatRateBp === rate ? shipping.excl.amount : 0);
    const vat = ofRate.reduce((s, l) => s + l.vat.amount, 0) + (shipping?.vatRateBp === rate ? shipping.vat.amount : 0);
    return { vatRateBp: rate, base: money(base), vat: money(vat) };
  });
  const totalExcl = byRate.reduce((s, r) => s + r.base.amount, 0);
  const totalVat = byRate.reduce((s, r) => s + r.vat.amount, 0);
  return { lines: out, shipping, byRate, totalExcl: money(totalExcl), totalVat: money(totalVat), totalIncl: money(totalExcl + totalVat) };
}
