// Ordering at the supplier, in the shop's own words: the purchasing code
// (src/lib/orders/purchasing.ts) knows this, never the supplier's API
// (.claude/rules/catalogus.md § De grens is hard). Server-side only.
//
// ⚠️ A placed order is a real, invoiceable order (docs/api/LEVERANCIER.md §
// 10). So ordering is off unless SUPPLIER_ORDERING says otherwise, and each
// mode only works against its own supplier address (./bigbuy/ordering.ts).

import type { Money } from "@/lib/money";
import { bigbuyOrdering, orderingMode } from "./bigbuy/ordering";

export type SupplierOrderRequest = {
  /** Our own reference at the supplier: how a lost answer is found again (docs/IDEMPOTENCY.md). */
  reference: string;
  lines: { sku: string; quantity: number }[];
  address: { firstName: string; lastName: string; street: string; houseNumber: string; postcode: string; city: string; country: string; phone: string; email: string };
  language: "nl" | "en";
};

export type CheckAnswer =
  /** What the supplier would charge: the products without VAT and shipping, and everything. */
  | { kind: "ok"; products: Money; total: Money }
  | { kind: "refused"; status: number; message: string }
  /** No answer, or one we cannot read: ask again later. A check orders nothing. */
  | { kind: "unknown" };

export type PlaceAnswer =
  | { kind: "placed"; supplierOrderRef: string }
  /** A definite refusal: nothing was created. */
  | { kind: "refused"; status: number; message: string }
  /** It may or may not have arrived: UNKNOWN, and ask by the reference — never send again blindly. */
  | { kind: "unknown" };

export type LookupAnswer = { kind: "found"; supplierOrderRef: string } | { kind: "absent" } | { kind: "unknown" };

export interface SupplierOrdering {
  readonly source: "bigbuy";
  readonly mode: "sandbox" | "live";
  check(req: SupplierOrderRequest): Promise<CheckAnswer>;
  place(req: SupplierOrderRequest): Promise<PlaceAnswer>;
  lookup(reference: string): Promise<LookupAnswer>;
}

export type OrderingMode = "off" | "sandbox" | "live";
export { orderingMode };

let configured: SupplierOrdering | null | undefined;

/** The shop's ordering from the environment; null while SUPPLIER_ORDERING is off. */
export function defaultOrdering(): SupplierOrdering | null {
  if (configured === undefined) configured = bigbuyOrdering(process.env);
  return configured;
}
