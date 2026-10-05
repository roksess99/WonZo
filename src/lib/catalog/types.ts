// The contract of the catalog (docs/DATAMODEL.md § Product). Components and
// domain logic import only from here; supplier DTOs never leave the adapter
// (.claude/rules/catalogus.md).

import type { Money } from "@/lib/money";

export type Availability = "in_stock" | "backorder" | "out_of_stock";

export type Delivery = {
  /** Working days from order to delivery, including handling at the supplier. */
  minWorkingDays: number;
  maxWorkingDays: number;
  /** ISO 3166-1 alpha-2 country the parcel ships from (ACM: must be stated). */
  shipsFrom: string;
};

export type Manufacturer = {
  name: string;
  address: string | null;
  country: string | null;
  email: string | null;
  website: string | null;
};

export type Product = {
  id: string;
  source: "bigbuy";
  /** Readable, contains the id: "kruidenrek-bamboe-1300779". */
  slug: string;
  name: string;
  brand: string | null;
  sku: string;
  ean: string | null;
  /** Selling price incl. VAT, before any promotion. Fase 1: mock (D-03 open). */
  price: Money;
  vatRateBasisPoints: number;
  availability: Availability;
  /** Stock of the chosen offer. */
  stock: number;
  /** The offer price, stock and delivery come from (docs/api/LEVERANCIER.md § 7). */
  offerId: string;
  delivery: Delivery;
  /**
   * What the supplier charges to ship this product alone to the Netherlands
   * (docs/api/LEVERANCIER.md § 10). Decides whether it is a large item with
   * its own shipping costs (D-13); src/lib/pricing/shipping.ts uses it.
   */
  shippingAlone: Money;
  imageUrls: string[];
  categoryKey: string;
  subcategoryKey: string;
  specs: { label: string; value: string }[];
  /** Plain text paragraphs; supplier HTML is never rendered as HTML. */
  description: string[];
  safety: { manufacturer: Manufacturer | null; warnings: string[] };
  /** ISO date the supplier added the product; used for "newest". */
  addedAt: string;
};
