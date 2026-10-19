// The legal texts per language: terms, privacy statement, model withdrawal
// form (D-32, owner 2026-10-15: Dutch and English, the Dutch text decisive).
// Their own files, because they are documents, not interface texts;
// scripts/check-messages.mjs keeps both languages the same shape.

import en from "../../../messages/legal/en.json";
import nl from "../../../messages/legal/nl.json";
import type { Locale } from "./config";

export type LegalTexts = typeof nl;
export type LegalSection = LegalTexts["terms"]["sections"][number];

const texts: Record<Locale, LegalTexts> = { nl, en };

export function getLegal(locale: Locale): LegalTexts {
  return texts[locale];
}

/**
 * When the texts last changed in substance (docs/PRIVACY.md § Bijwerken: the
 * date goes up with every change to what is processed). Set by hand, never
 * the build date: a rebuild changes nothing for the customer.
 */
export const LEGAL_UPDATED = new Date("2026-10-15T12:00:00Z");
