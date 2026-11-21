// Structured data (schema.org JSON-LD) for search engines and AI search
// (.claude/rules/frontend.md § SEO: the markup describes what is on the page,
// from the same fields). Pure: the values come from the company details, the
// shipping rule and the return window the shop itself uses, so the markup
// can never promise something the page does not say.

import type { Product } from "@/lib/catalog/types";
import { company } from "@/lib/company";
import { toDecimalString } from "@/lib/money";
import { shippingFor } from "@/lib/pricing/shipping";
import { WITHDRAWAL_DAYS } from "@/lib/returns/amount";

/** "Thaliastraat 267, 6846 XX Arnhem" → its parts; null when the address has another shape (then it is left out, not guessed). */
export function postalAddress(address: string | null): { streetAddress: string; postalCode: string; addressLocality: string } | null {
  const m = /^(.+?),\s*(\d{4}\s?[A-Z]{2})\s+(.+)$/.exec(address?.trim() ?? "");
  return m ? { streetAddress: m[1]!, postalCode: m[2]!, addressLocality: m[3]! } : null;
}

/** Who sells: on every page, so search engines and AI answers know the shop as one company (D-35: company details). */
export function organizationJsonLd(base: URL) {
  const address = postalAddress(company.address);
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": new URL("/#organization", base).toString(),
    name: company.tradeName,
    legalName: company.legalName,
    url: new URL("/", base).toString(),
    logo: new URL("/brand/png/wonzo-mark-512px.png", base).toString(),
    email: company.email,
    ...(company.vat ? { vatID: company.vat } : {}),
    identifier: { "@type": "PropertyValue", propertyID: "KvK", value: company.kvk },
    ...(address ? { address: { "@type": "PostalAddress", ...address, addressCountry: "NL" } } : {}),
    areaServed: { "@type": "Country", name: "NL" },
  };
}

/**
 * The offer of one product page: price and availability, what shipping one
 * piece costs (the shop's own rule, D-13: free from € 50, large items per
 * piece), the delivery time and the 14-day withdrawal window. No rating until
 * there are real reviews (D-12).
 */
export function productJsonLd(p: Product, url: string, base: URL) {
  const shipping = shippingFor(p.price, [{ shippingAlone: p.shippingAlone, quantity: 1 }]).total;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku,
    ...(p.ean ? { gtin13: p.ean } : {}),
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    ...(p.imageUrls.length ? { image: p.imageUrls.map((u) => new URL(u, base).toString()) } : {}),
    description: p.description.join(" "),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: p.price.currency,
      price: toDecimalString(p.price),
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": new URL("/#organization", base).toString() },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: toDecimalString(shipping), currency: shipping.currency },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "NL" },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          transitTime: { "@type": "QuantitativeValue", minValue: p.delivery.minWorkingDays, maxValue: p.delivery.maxWorkingDays, unitCode: "DAY" },
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "NL",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: WITHDRAWAL_DAYS,
        returnMethod: "https://schema.org/ReturnByMail",
      },
    },
  };
}

/** For a <script type="application/ld+json">: our own data, with "<" escaped so a product name cannot close the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
