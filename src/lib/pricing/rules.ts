// The price rule, the floor and the promotions (docs/PRIJZEN.md, D-03, D-08,
// D-16). Pure: the catalog runs it where the purchase price is still in view,
// and the page, the cart and the order all get the product it priced.
//
//   purchase price (excl. VAT)
// + markup of the subcategory, else the default   ← no default: the advised price
// + VAT                                           = the list price
// − the highest active promotion                  ← never below the floor
//                                                 = the price the customer pays
//
// The floor is the landed cost (purchase + payment costs per piece, D-16)
// plus VAT. It holds always, also for the advised price.

import type { Money } from "@/lib/money";
import { sellingPrice } from "./index";

/** 0 to 1000 %: anything else is refused, not clipped (docs/PRIJZEN.md § 1). */
export const MAX_MARKUP_BP = 100_000;
/** A promotion of 1 to 95 % (docs/DATAMODEL.md § DiscountRule): the floor limits it per product anyway. */
export const MIN_PROMOTION_BP = 100;
export const MAX_PROMOTION_BP = 9_500;

export type PriceRules = {
  /** null: no price rule — the supplier's advised price (docs/PRIJZEN.md § 1). */
  defaultMarkupBp: number | null;
  /** Per subcategory, keyed "category/subcategory": overrides the default. */
  markups: ReadonlyMap<string, number>;
  /** D-16: payment costs per piece, excluding VAT, in cents. */
  paymentCostCents: number;
};

export const NO_RULES: PriceRules = { defaultMarkupBp: null, markups: new Map(), paymentCostCents: 0 };

export type PromotionTarget = { kind: "category" | "subcategory" | "product"; key: string };

export type Promotion = {
  id: string;
  name: string;
  target: PromotionTarget;
  percentBp: number;
  startsAt: Date;
  endsAt: Date;
};

export type PriceInput = {
  productId: string;
  categoryKey: string;
  subcategoryKey: string;
  costExcl: Money;
  advisedExcl: Money;
  vatRateBp: number;
};

export type AppliedPromotion = {
  id: string;
  name: string;
  requestedBp: number;
  /** The discount the customer gets, in whole percent, rounded down (docs/PRIJZEN.md § 2: rather 9 % than a promised 10 %). */
  shownPercent: number;
  /** The floor took part of it. */
  limited: boolean;
  endsAt: Date;
};

export type PriceOutcome = {
  /** Before any promotion, incl. VAT: the basis for the price history. */
  listPrice: Money;
  /** What the customer pays, incl. VAT. */
  price: Money;
  floor: Money;
  basis: "markup" | "advised";
  /** The rule's floor lifted the list price itself (a markup or advised price below it). */
  raisedToFloor: boolean;
  promotion: AppliedPromotion | null;
  /** A promotion that matched but left nothing once the floor was applied. */
  blockedPromotion: { id: string; requestedBp: number } | null;
};

export const subcategoryRuleKey = (categoryKey: string, subcategoryKey: string) => `${categoryKey}/${subcategoryKey}`;

/** amount × (10 000 + bp) / 10 000, rounded half up to a cent, once. */
function withBasisPoints(amount: number, bp: number): number {
  return Math.floor((2 * amount * (10_000 + bp) + 10_000) / 20_000);
}

export function markupFor(rules: PriceRules, categoryKey: string, subcategoryKey: string): number | null {
  return rules.markups.get(subcategoryRuleKey(categoryKey, subcategoryKey)) ?? rules.defaultMarkupBp;
}

export const promotionActive = (p: Promotion, now: Date) => p.startsAt.getTime() <= now.getTime() && now.getTime() < p.endsAt.getTime();

export function promotionMatches(p: Promotion, input: Pick<PriceInput, "productId" | "categoryKey" | "subcategoryKey">): boolean {
  switch (p.target.kind) {
    case "product":
      return p.target.key === input.productId;
    case "subcategory":
      return p.target.key === subcategoryRuleKey(input.categoryKey, input.subcategoryKey);
    case "category":
      return p.target.key === input.categoryKey;
  }
}

export function priceProduct(input: PriceInput, rules: PriceRules, promotions: readonly Promotion[], now: Date): PriceOutcome {
  const { costExcl, advisedExcl, vatRateBp } = input;
  const currency = costExcl.currency;
  const landed = costExcl.amount + rules.paymentCostCents;
  const floor = sellingPrice({ amount: landed, currency }, vatRateBp);

  const markup = markupFor(rules, input.categoryKey, input.subcategoryKey);
  const basis = markup === null ? "advised" : "markup";
  const ruled = markup === null ? sellingPrice(advisedExcl, vatRateBp) : sellingPrice({ amount: withBasisPoints(costExcl.amount, markup), currency }, vatRateBp);
  const raisedToFloor = ruled.amount < floor.amount;
  const listPrice: Money = raisedToFloor ? floor : ruled;

  // The highest wins, never stacked (docs/PRIJZEN.md § 2); on a tie the one that started first, then the lowest id.
  const best = promotions
    .filter((p) => promotionActive(p, now) && promotionMatches(p, input))
    .sort((a, b) => b.percentBp - a.percentBp || a.startsAt.getTime() - b.startsAt.getTime() || (a.id < b.id ? -1 : 1))[0];
  if (!best) return { listPrice, price: listPrice, floor, basis, raisedToFloor, promotion: null, blockedPromotion: null };

  const asked = withBasisPoints(listPrice.amount, -best.percentBp);
  const amount = Math.max(asked, floor.amount);
  if (amount >= listPrice.amount) return { listPrice, price: listPrice, floor, basis, raisedToFloor, promotion: null, blockedPromotion: { id: best.id, requestedBp: best.percentBp } };
  const shownPercent = Math.floor(((listPrice.amount - amount) * 100) / listPrice.amount);
  return {
    listPrice,
    price: { amount, currency },
    floor,
    basis,
    raisedToFloor,
    promotion: { id: best.id, name: best.name, requestedBp: best.percentBp, shownPercent, limited: amount > asked, endsAt: best.endsAt },
    blockedPromotion: null,
  };
}

/** The largest discount a markup leaves room for: markup / (100 + markup), in basis points, rounded down. */
export function maxDiscountBp(markupBp: number): number {
  return Math.floor((markupBp * 10_000) / (10_000 + markupBp));
}
