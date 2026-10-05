// The selection rule of D-02: a product enters the shop only if it passes
// every rule. Enforced in code, not as a navigation filter — a direct URL to
// an excluded product finds nothing. Pure, no I/O.

import { placeInAssortment } from "./assortment";
import { excludedByD36, hasElectricalName, legalClass } from "./legal-class";

export type Candidate = {
  /** Supplier taxonomy names, root first (Dutch). */
  taxonomyPath: string[];
  hs: string | null;
  /** Names in every language we show; all are checked for electrical words. */
  names: string[];
  condition: string;
  active: boolean;
  stock: number;
  hasManufacturer: boolean;
};

export type Verdict =
  | { allowed: true; categoryKey: string; subcategoryKey: string }
  | { allowed: false; reasons: string[] };

/**
 * Rule 7 (price floor or minimum order) waits for D-03 and D-13; there is no
 * value yet, so it is not applied here.
 */
export function select(c: Candidate): Verdict {
  const reasons: string[] = [];
  const place = placeInAssortment(c.taxonomyPath);
  if (!place) reasons.push("categorie niet toegestaan");
  const { weight } = legalClass(c.hs);
  if (weight !== "basis" && weight !== "licht") reasons.push(`douanecode: ${weight}`);
  for (const name of c.names) {
    const excluded = excludedByD36(c.hs, name);
    if (excluded) reasons.push(`uitgesloten (D-36): ${excluded}`);
    if (hasElectricalName(name)) reasons.push("elektrisch kenmerk in de naam");
  }
  if (c.condition !== "NEW") reasons.push(`conditie ${c.condition || "onbekend"}`);
  if (!c.active) reasons.push("niet actief");
  if (c.stock <= 0) reasons.push("geen voorraad");
  if (!c.hasManufacturer) reasons.push("geen GPSR-gegevens");
  if (reasons.length || !place) return { allowed: false, reasons: [...new Set(reasons)] };
  return { allowed: true, ...place };
}
