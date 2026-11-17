// The product description, regrouped for the page (src/lib/catalog/description.ts):
// prose stays prose, flattened lists and "Key: value" lines become a table.
// Shape of the input as seen 2026-11-16 (an InnovaGoods camping chair, shortened).

import { describe, expect, it } from "vitest";
import { structureDescription, type DescriptionBlock } from "@/lib/catalog/description";

const words = (blocks: DescriptionBlock[]) =>
  blocks.flatMap((b) => (b.kind === "text" ? [b.text] : b.facts.flatMap((f) => [...(f.label ? [`${f.label}:`] : []), ...f.values])));

describe("the product description", () => {
  const chair = [
    "Deze inklapbare campingstoel is de ideale metgezel voor alle buitenactiviteiten. Hij is gemakkelijk in te klappen.",
    "Ergonomisch design, ademend: onze campingstoel is perfect om in te zitten. De zitting heeft ventilatiegaten.",
    "Materiaal:",
    "Polyester",
    "Ijzer",
    "Kleur:",
    "Zwart",
    "Groen",
    "Soort: Inklapbare campingstoel",
    "Eigenschappen:",
    "Ademend",
    "Max. ondersteunt gewicht: 120 kg",
    "Gesch. afmetingen uitgevouwen: 58 x 64 x 52,5 cm",
    "Verpakking en handleiding in 24 talen: Engels, Frans, Spaans, Duits, Nederlands.",
  ];

  it("keeps the prose and gathers the flattened lists into one table", () => {
    expect(structureDescription(chair)).toEqual([
      { kind: "text", text: chair[0] },
      { kind: "text", text: chair[1] },
      {
        kind: "facts",
        facts: [
          { label: "Materiaal", values: ["Polyester", "Ijzer"] },
          { label: "Kleur", values: ["Zwart", "Groen"] },
          { label: "Soort", values: ["Inklapbare campingstoel"] },
          { label: "Eigenschappen", values: ["Ademend"] },
          { label: "Max. ondersteunt gewicht", values: ["120 kg"] },
          { label: "Gesch. afmetingen uitgevouwen", values: ["58 x 64 x 52,5 cm"] },
          { label: "Verpakking en handleiding in 24 talen", values: ["Engels, Frans, Spaans, Duits, Nederlands."] },
        ],
      },
    ]);
  });

  it("never drops or changes a word: a title without items stays a line of text", () => {
    const input = ["Een gewone zin over het product.", "Kleur:", "Een tweede alinea, lang genoeg en met twee zinnen. Zo blijft het tekst."];
    const out = structureDescription(input);
    expect(out).toEqual(input.map((text) => ({ kind: "text", text })));
    expect(words(structureDescription(chair)).join(" ").replace(/:/g, "")).toBe(chair.join(" ").replace(/:/g, ""));
  });

  it("a description of only prose is unchanged", () => {
    const prose = ["Een mand voor je hond. Zacht en wasbaar.", "Past in elke kamer; ook in een kleine."];
    expect(structureDescription(prose)).toEqual(prose.map((text) => ({ kind: "text", text })));
  });

  it("a short line after a table row joins the table, before any table it is text", () => {
    expect(structureDescription(["Wasbaar"])).toEqual([{ kind: "text", text: "Wasbaar" }]);
    expect(structureDescription(["Soort: Mand", "Wasbaar"])).toEqual([
      { kind: "facts", facts: [{ label: "Soort", values: ["Mand"] }, { label: null, values: ["Wasbaar"] }] },
    ]);
  });
});
