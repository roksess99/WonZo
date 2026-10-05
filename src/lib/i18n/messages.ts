// Shop texts per language (D-32). Only the shop's own texts live here;
// product names, descriptions and properties come from the supplier per
// language. Loaded on the server, so no dictionary ends up in the browser.

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import { interpolate } from "@/lib/text";
import type { Locale } from "./config";

export type Messages = typeof nl;

// en.json must have exactly nl.json's shape; scripts/check-messages.mjs
// enforces it at build time, the type check here at compile time.
const dictionaries: Record<Locale, Messages> = { nl, en };

export function getMessages(locale: Locale): Messages {
  return dictionaries[locale];
}

/** "Bezorgd in {min}–{max} werkdagen" with values. */
export function t(template: string, values: Record<string, string | number> = {}): string {
  return interpolate(template, values);
}
