// The light and the dark theme (D-33, docs/BRAND.md § Donkere modus): the
// contrast of every pair the shop uses, recomputed from globals.css itself so
// a changed colour cannot slip under WCAG 2.2 AA; and the stored choice.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseThemeChoice, THEME_KEY, THEME_SCRIPT } from "@/lib/theme";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** The tokens of one theme: light-dark(a, b) gives a or b, a plain colour both. */
function tokens(theme: "light" | "dark"): Record<string, string> {
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  const out: Record<string, string> = {};
  for (const m of root.matchAll(/--([a-z-]+):\s*(light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)|(#[0-9a-f]{6}))/g)) {
    out[m[1]!] = (m[5] ?? (theme === "light" ? m[3] : m[4]))!;
  }
  return out;
}

/** WCAG 2.2 relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// [text or part, on, at least]: 4.5 for normal text, 3 for UI parts (docs/BRAND.md § Contrast).
const PAIRS: [string, string, number][] = [
  ["foreground", "background", 4.5],
  ["foreground", "surface", 4.5],
  ["muted", "background", 4.5],
  ["muted", "surface", 4.5],
  ["border", "background", 3],
  ["border", "surface", 3],
  ["accent", "background", 4.5],
  ["accent", "surface", 4.5],
  ["accent-contrast", "accent", 4.5],
  ["accent-contrast", "danger", 4.5],
  ["foreground", "brand-soft", 4.5],
  ["on-petrol", "petrol", 4.5],
  ["in-stock", "background", 4.5],
  ["in-stock", "surface", 4.5],
  ["danger", "background", 4.5],
  ["danger", "surface", 4.5],
  ["danger", "danger-soft", 4.5],
  ["success", "background", 4.5],
  ["success", "surface", 4.5],
  ["success", "success-soft", 4.5],
  ["warning", "background", 4.5],
  ["warning", "surface", 4.5],
  ["warning", "warning-soft", 4.5],
  ["focus", "background", 3],
  ["focus", "surface", 3],
  ["focus-on-dark", "petrol", 3],
];

describe("contrast in both themes (WCAG 2.2 AA)", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`${theme}: every pair the shop uses`, () => {
      const t = tokens(theme);
      const low = PAIRS.filter(([a, b, min]) => !(contrast(t[a]!, t[b]!) >= min)).map(([a, b, min]) => `${a} on ${b}: ${contrast(t[a]!, t[b]!).toFixed(2)} < ${min}`);
      expect(low).toEqual([]);
    });
  }

  it("the light theme is what it was (docs/BRAND.md): a few hand-checked values", () => {
    const t = tokens("light");
    // From the table in docs/BRAND.md § Contrast (2026-10-04).
    expect(contrast(t["accent-contrast"]!, t.accent!).toFixed(2)).toBe("4.90");
    expect(contrast(t.muted!, t.background!).toFixed(2)).toBe("5.48");
    expect(t.background).toBe("#faf6f0");
  });

  it("product photos stay on white in both themes", () => {
    expect(tokens("light").photo).toBe("#ffffff");
    expect(tokens("dark").photo).toBe("#ffffff");
  });
});

describe("the visitor's choice", () => {
  it("only light or dark is taken from storage; anything else leaves it to the device", () => {
    expect(parseThemeChoice("dark")).toBe("dark");
    expect(parseThemeChoice("light")).toBe("light");
    for (const bad of ["system", "DARK", "", null, 1, "<script>"]) expect(parseThemeChoice(bad)).toBeNull();
  });

  it("the script in <head> sets the stored choice, ignores the rest, and survives blocked storage", () => {
    const run = (stored: string | null, blocked = false) => {
      const attrs: Record<string, string> = { "data-theme": "system" };
      const localStorage = { getItem: (k: string) => { if (blocked) throw new Error("blocked"); return k === THEME_KEY ? stored : null; } };
      const document = { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
      new Function("localStorage", "document", THEME_SCRIPT)(localStorage, document);
      return attrs["data-theme"];
    };
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
    expect(run("evil")).toBe("system");
    expect(run(null)).toBe("system");
    expect(run("dark", true)).toBe("system");
  });
});
