// Delivery estimate shown on every step of the funnel (D-13, ACM: a correct
// delivery time and the country of shipping, during ordering).
//
// Handling days come from the supplier's stock row (GEMETEN 2026-10-05: 0–1
// or 1–2 days). Transit depends on the carrier service, which is D-13 and
// still OPEN; the measured services to NL run from "1-2 dagen" to
// "6-10 dagen". Until D-13 is decided these two values are an AANNAME, kept
// here and nowhere else.

import type { Delivery } from "./types";

/** AANNAME until D-13: transit in working days for the standard service. */
export const TRANSIT_WORKING_DAYS = { min: 3, max: 5 } as const;

/** AANNAME: BigBuy warehouse 1 is in Spain (company seat Valencia); location of the warehouse not measured. */
export const SHIPS_FROM = "ES";

export type StockRow = { quantity: number; minHandlingDays: number; maxHandlingDays: number; warehouse: number };

/**
 * One offer: the fastest stock row that has stock. Price, stock and delivery
 * all come from that row (docs/api/LEVERANCIER.md § 7) — never the stock of
 * one row with the speed of another.
 */
export function chooseOffer(rows: StockRow[]): StockRow | null {
  return [...rows].filter((r) => r.quantity > 0).sort((a, b) => a.maxHandlingDays - b.maxHandlingDays || a.minHandlingDays - b.minHandlingDays)[0] ?? null;
}

export function deliveryFor(row: StockRow): Delivery {
  return {
    minWorkingDays: row.minHandlingDays + TRANSIT_WORKING_DAYS.min,
    maxWorkingDays: row.maxHandlingDays + TRANSIT_WORKING_DAYS.max,
    shipsFrom: SHIPS_FROM,
  };
}
