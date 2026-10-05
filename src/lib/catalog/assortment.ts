// The WonZo assortment (D-02): WonZo's own categories, each pointing at
// supplier subcategories by NAME, not by id — the stability of supplier
// category ids is not measured yet (.claude/rules/catalogus.md). Names are
// the exact production names (GEMETEN 2026-10-05); note that "Keukengerei"
// exists twice under "Huis en koken" and that some names carry a trailing
// space, so matching trims.

import type { Locale } from "@/lib/i18n/config";

export type Subcategory = {
  key: string;
  slug: Record<Locale, string>;
  /** Supplier taxonomy name paths (Dutch); a product matches if its path starts with one. */
  sources: string[][];
};

export type Category = {
  key: string;
  slug: Record<Locale, string>;
  subcategories: Subcategory[];
};

export const assortment: Category[] = [
  {
    key: "wonen",
    slug: { nl: "wonen", en: "home" },
    subcategories: [
      { key: "opslag", slug: { nl: "opslag-en-organisatie", en: "storage" }, sources: [["Huis en koken", "Opslag en organisatie"]] },
      { key: "meubels", slug: { nl: "meubels", en: "furniture" }, sources: [["Huis en koken", "Meubilair"]] },
      { key: "decoratie", slug: { nl: "decoratie", en: "decor" }, sources: [["Huis en koken", "Huisdecoratie"]] },
      {
        key: "keuken",
        slug: { nl: "servies-en-keuken", en: "kitchen-and-tableware" },
        sources: [["Huis en koken", "Bestek, servies en glaswerk"], ["Huis en koken", "Keukengerei"]],
      },
    ],
  },
  {
    key: "tuin",
    slug: { nl: "tuin", en: "garden" },
    subcategories: [
      { key: "tuinmeubels", slug: { nl: "tuinmeubels", en: "garden-furniture" }, sources: [["Tuin", "Tuinmeubelen en accessoires"]] },
      { key: "bewatering", slug: { nl: "bewatering", en: "watering" }, sources: [["Tuin", "Tuinieren", "Bewatering"]] },
      {
        key: "barbecue",
        slug: { nl: "barbecue", en: "barbecue" },
        sources: [
          ["Tuin", "Buitenbarbecue en dineren", "Barbecues"],
          ["Tuin", "Buitenbarbecue en dineren", "Accessoires voor barbecues en rokerijen"],
        ],
      },
    ],
  },
  {
    key: "buitenleven",
    slug: { nl: "buitenleven", en: "outdoors" },
    subcategories: [
      {
        key: "kamperen",
        slug: { nl: "kamperen", en: "camping" },
        sources: [
          ["Sport en outdoor", "Kamperen en wandelen", "Kampeermeubelen"],
          ["Sport en outdoor", "Kamperen en wandelen", "Slaapuitrusting voor kamperen"],
        ],
      },
      {
        key: "thuis-sporten",
        slug: { nl: "thuis-sporten", en: "home-fitness" },
        sources: [
          ["Sport en outdoor", "Fitness en lichaamsbeweging", "Spieropbouw"],
          ["Sport en outdoor", "Fitness en lichaamsbeweging", "Pilates"],
          ["Sport en outdoor", "Fitness en lichaamsbeweging", "Yoga"],
        ],
      },
    ],
  },
  {
    key: "dieren",
    slug: { nl: "dieren", en: "pets" },
    subcategories: [
      {
        key: "halsbanden",
        slug: { nl: "halsbanden-en-tuigen", en: "collars-and-harnesses" },
        sources: [
          ["Dierproducten", "Honden", "Halsbanden, tuigen en leibanden"],
          ["Dierproducten", "Katten", "Halsbanden, tuigen en leibanden"],
        ],
      },
      {
        key: "manden",
        slug: { nl: "manden-en-dekens", en: "beds-and-blankets" },
        sources: [
          ["Dierproducten", "Honden", "Bedden en meubilair"],
          ["Dierproducten", "Katten", "Bedden, dekens en meubilair"],
        ],
      },
      { key: "kleding", slug: { nl: "hondenkleding", en: "dog-clothing" }, sources: [["Dierproducten", "Honden", "Kleding en accessoires"]] },
    ],
  },
];

const norm = (s: string) => s.trim().toLowerCase();

/** Which WonZo subcategory a supplier taxonomy path (Dutch names, root first) belongs to. */
export function placeInAssortment(path: string[]): { categoryKey: string; subcategoryKey: string } | null {
  const p = path.map(norm);
  for (const category of assortment) {
    for (const sub of category.subcategories) {
      for (const source of sub.sources) {
        if (source.length <= p.length && source.every((name, i) => norm(name) === p[i])) {
          return { categoryKey: category.key, subcategoryKey: sub.key };
        }
      }
    }
  }
  return null;
}

export function findCategoryBySlug(locale: Locale, slug: string): Category | undefined {
  return assortment.find((c) => c.slug[locale] === slug);
}

export function findSubcategoryBySlug(category: Category, locale: Locale, slug: string): Subcategory | undefined {
  return category.subcategories.find((s) => s.slug[locale] === slug);
}

export function categoryByKey(key: string): Category | undefined {
  return assortment.find((c) => c.key === key);
}
