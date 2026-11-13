// BigBuy DTO → canonical Product. The only place that knows both shapes.

import type { Locale } from "@/lib/i18n/config";
import { fromDecimal, MoneyError } from "@/lib/money";
import { NO_RULES, priceProduct, type PriceInput, type PriceOutcome, type PriceRules, type Promotion } from "@/lib/pricing/rules";
import { htmlToParagraphs, slugify } from "@/lib/text";
import { chooseOffer, deliveryFor } from "../delivery";
import { select, type Verdict } from "../selection";
import type { Product } from "../types";
import type { BigBuyCompliance, BigBuyImages, BigBuyInformation, BigBuyLowestShipping, BigBuyProduct, BigBuyStock } from "./dto";

export type SupplierRecord = {
  product: BigBuyProduct;
  stock: BigBuyStock | null;
  /** Information per shop language. */
  info: Partial<Record<Locale, BigBuyInformation>>;
  images: BigBuyImages | null;
  compliance: BigBuyCompliance | null;
  shipping: BigBuyLowestShipping | null;
  /** Taxonomy names root first (Dutch), from the supplier tree. */
  taxonomyPath: string[];
  brand: string | null;
};

/** `priceInput` is server-side only (D-16: the purchase price never reaches the shop's browser). */
export type MapResult = { product: Product; verdict: Verdict; pricing: PriceOutcome; priceInput: PriceInput } | { product: null; verdict: Verdict };

/** What the price rule needs (src/lib/pricing/rules.ts). Without it: no rule, no promotion — the advised price. */
export type PricingContext = { rules: PriceRules; promotions: readonly Promotion[]; now: Date };
const NO_PRICING: PricingContext = { rules: NO_RULES, promotions: [], now: new Date(0) };

export function toProduct(locale: Locale, r: SupplierRecord, pricingContext: PricingContext = NO_PRICING): MapResult {
  const offer = chooseOffer(r.stock?.stocks ?? []);
  const manufacturer = r.compliance?.generalProductSafetyRegulations?.[0] ?? null;
  const names = Object.values(r.info).map((i) => i!.name);

  const verdict = select({
    taxonomyPath: r.taxonomyPath,
    hs: r.product.intrastat,
    names,
    condition: r.product.condition,
    active: r.product.active === 1,
    stock: offer?.quantity ?? 0,
    hasManufacturer: Boolean(manufacturer?.name && manufacturer.address),
    hasShippingCost: r.shipping !== null,
  });
  const info = r.info[locale];
  if (!verdict.allowed || !offer || !info || !r.shipping) return { product: null, verdict };
  // BigBuy's taxRate is its Spanish rate: 21, 10 and 4 in the assortment's groups
  // (GEMETEN 2026-10-05, tmp/catalog-explore). The Dutch rate for this assortment is
  // 21 % (AANNAME until the bookkeeper confirms, D-15). Another rate is not shown,
  // priced or invoiced: the owner looks first (D-03).
  if (r.product.taxRate !== 21) return { product: null, verdict: { allowed: false, reasons: [`btw-tarief van de leverancier ${r.product.taxRate} %, niet 21 %`] } };

  const vatRateBasisPoints = Math.round(r.product.taxRate * 100);
  let pricing: PriceOutcome;
  let priceInput: PriceInput;
  let shippingAlone;
  try {
    // The purchase price is in view here and nowhere after (docs/PRIJZEN.md § 2): the floor is guarded in this one place.
    priceInput = {
      productId: String(r.product.id),
      categoryKey: verdict.categoryKey,
      subcategoryKey: verdict.subcategoryKey,
      costExcl: fromDecimal(r.product.wholesalePrice),
      advisedExcl: fromDecimal(r.product.retailPrice),
      vatRateBp: vatRateBasisPoints,
    };
    pricing = priceProduct(
      priceInput,
      pricingContext.rules,
      pricingContext.promotions,
      pricingContext.now,
    );
    shippingAlone = fromDecimal(r.shipping.cost);
  } catch (err) {
    if (err instanceof MoneyError) return { product: null, verdict: { allowed: false, reasons: [`ongeldige prijs: ${err.message}`] } };
    throw err;
  }

  const images = [...(r.images?.images ?? [])].sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.position - b.position);
  const specs: { label: string; value: string }[] = [];
  if (r.brand) specs.push({ label: "brand", value: r.brand });
  specs.push({ label: "sku", value: r.product.sku });
  if (r.product.ean13) specs.push({ label: "ean", value: r.product.ean13 });
  // GEMETEN 2026-10-05: dimensions of 1 × 1 × 1 are placeholders; only show real ones.
  const { width, height, depth } = r.product;
  if (width && height && depth && !(width === 1 && height === 1 && depth === 1)) {
    // In the notation of the page: 59,1 on Dutch pages, 59.1 on English ones.
    const cm = new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-GB", { maximumFractionDigits: 2 });
    specs.push({ label: "dimensions", value: `${cm.format(width)} × ${cm.format(height)} × ${cm.format(depth)} cm` });
  }

  return {
    verdict,
    pricing,
    priceInput,
    product: {
      id: String(r.product.id),
      source: "bigbuy",
      slug: `${slugify(info.name)}-${r.product.id}`,
      name: info.name.trim(),
      brand: r.brand,
      sku: r.product.sku,
      ean: r.product.ean13 || null,
      price: pricing.price,
      promotion: pricing.promotion ? { id: pricing.promotion.id, listPrice: pricing.listPrice, shownPercent: pricing.promotion.shownPercent, endsAt: pricing.promotion.endsAt.toISOString() } : null,
      vatRateBasisPoints,
      availability: "in_stock",
      stock: offer.quantity,
      offerId: `${r.product.id}:${offer.warehouse}:${offer.minHandlingDays}-${offer.maxHandlingDays}`,
      delivery: deliveryFor(offer),
      shippingAlone,
      imageUrls: images.map((i) => i.url),
      categoryKey: verdict.categoryKey,
      subcategoryKey: verdict.subcategoryKey,
      specs,
      description: htmlToParagraphs(info.description),
      safety: {
        manufacturer: manufacturer
          ? {
              name: manufacturer.name,
              address: manufacturer.address,
              country: manufacturer.countryIsoCode,
              email: manufacturer.contact,
              website: manufacturer.webSite,
            }
          : null,
        warnings: manufacturer?.safetyWarnings ?? [],
      },
      addedAt: r.product.dateAdd,
    },
  };
}
