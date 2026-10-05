// Legal weight of a product, derived from its customs code (intrastat / HS)
// and its name (docs/ONDERZOEK.md § 6–7, D-02, D-36). A triage heuristic —
// WETTELIJK, to be confirmed by an adviser. Keep in step with
// scripts/explore-catalog.mjs, which used the same table for the research.

export type Weight = "basis" | "licht" | "zwaar" | "onbekend";

export function legalClass(hs: string | null | undefined): { klass: string; weight: Weight } {
  const code = String(hs ?? "").replace(/\D/g, "");
  if (code.length < 4) return { klass: "onbekend", weight: "onbekend" };
  const c2 = code.slice(0, 2);
  const c4 = code.slice(0, 4);
  const c6 = code.slice(0, 6);
  const n2 = Number(c2);
  if (n2 >= 1 && n2 <= 24) return { klass: "voeding", weight: "zwaar" };
  if (c2 === "30") return { klass: "medisch", weight: "zwaar" };
  if (c2 === "33" || c4 === "3401") return { klass: "cosmetica", weight: "zwaar" };
  if (c4 === "3406") return { klass: "kaarsen", weight: "basis" };
  if (["28", "29", "31", "32", "34", "35", "36", "37", "38"].includes(c2)) return { klass: "chemisch", weight: "zwaar" };
  if (c2 === "93") return { klass: "wapens", weight: "zwaar" };
  if (c4 === "8211") return { klass: "messen", weight: "licht" };
  if (c6 === "950450" || c2 === "84" || c2 === "85") return { klass: "elektrisch of machine", weight: "zwaar" };
  if (c4 === "9405") return { klass: "verlichting", weight: "zwaar" };
  if (c2 === "91") return { klass: "klokken", weight: "zwaar" };
  if (c2 === "90") return { klass: "optisch, meet of medisch", weight: "zwaar" };
  if (c4 === "9503" || c4 === "9504") return { klass: "speelgoed", weight: "zwaar" };
  if (["3924", "4419", "6911", "6912", "7013", "7323", "7615", "8215"].includes(c4)) return { klass: "voedselcontact", weight: "licht" };
  if (n2 >= 50 && n2 <= 63) return { klass: "textiel", weight: "licht" };
  if (c4 >= "9401" && c4 <= "9404") return { klass: "meubels", weight: "basis" };
  if (c2 === "82") return { klass: "handgereedschap", weight: "basis" };
  if (c4 === "9506") return { klass: "sportartikelen", weight: "basis" };
  return { klass: "overig", weight: "basis" };
}

/**
 * Names that betray an electrical item or a battery even when the customs
 * code does not (GEMETEN 2026-10-05: an electric blanket coded as textile).
 */
const ELECTRICAL_NAME =
  /elektrisch|electric|oplaadba|rechargeable|\busb\b|\bled\b|led-|batterij|battery|\baccu\b|koeling|cooling|\bmotor\b|verwarm|heated|\bems\b|trilpla|vibration plate|luidspreker|speaker|bluetooth|\blamp\b|\bvolt\b|\d+\s?w\b|zonne-energie|solar/i;

export function hasElectricalName(name: string): boolean {
  return ELECTRICAL_NAME.test(name);
}

/**
 * Categories the owner excluded in D-36, by customs code or name: mattresses
 * and toppers, single-use plastic, sunglasses and other protective equipment,
 * swimming aids, knives, gas barbecues, pest control and pet food (the last
 * two already fall in "zwaar").
 */
export function excludedByD36(hs: string | null | undefined, name: string): string | null {
  const code = String(hs ?? "").replace(/\D/g, "");
  const c4 = code.slice(0, 4);
  const c6 = code.slice(0, 6);
  if (c6 === "940421" || c6 === "940429" || /matras|mattress|topper/i.test(name)) return "matras of topper";
  if (/wegwerp|disposable|single-use/i.test(name)) return "wegwerpplastic";
  if (c4 === "9004" || /zonnebril|sunglasses/i.test(name)) return "zonnebril";
  if (c6 === "650610" || /\bhelm\b|helmet|beschermer|protector/i.test(name)) return "beschermingsmiddel";
  if (c6 === "950629" || /zwemband|zwemvest|zwembandje|armbandjes|swim ring|armbands|opblaasba.*(zwem|water)/i.test(name)) return "zwemhulpmiddel";
  if (c4 === "8211" || /\bmes\b|messen|knife|knives/i.test(name)) return "mes";
  if (c6 === "732111" || /gasbarbecue|gas barbecue|gas bbq|gasstel|gas stove/i.test(name)) return "gastoestel";
  return null;
}
