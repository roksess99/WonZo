// BigBuy DTO → canonical Product. The only place that knows both shapes.

import type { Locale } from "@/lib/i18n/config";
import { fromDecimal, MoneyError } from "@/lib/money";
import { sellingPrice } from "@/lib/pricing";
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

export type MapResult = { product: Product; verdict: Verdict } | { product: null; verdict: Verdict };

export function toProduct(locale: Locale, r: SupplierRecord): MapResult {
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

  let price;
  let shippingAlone;
  try {
    price = sellingPrice(fromDecimal(r.product.retailPrice));
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
    specs.push({ label: "dimensions", value: `${width} × ${height} × ${depth} cm` });
  }

  return {
    verdict,
    product: {
      id: String(r.product.id),
      source: "bigbuy",
      slug: `${slugify(info.name)}-${r.product.id}`,
      name: info.name.trim(),
      brand: r.brand,
      sku: r.product.sku,
      ean: r.product.ean13 || null,
      price,
      vatRateBasisPoints: Math.round(r.product.taxRate * 100),
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
        warnings: (manufacturer?.safetyWarnings ?? []).map((w) => (typeof w === "string" ? w : JSON.stringify(w))).filter(Boolean),
      },
      addedAt: r.product.dateAdd,
    },
  };
}
