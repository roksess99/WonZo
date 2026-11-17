// The supplier's description arrives as plain paragraphs (htmlToParagraphs,
// src/lib/text.ts): its lists are flattened, so "Materiaal:" and then
// "Polyester", "IJzer" … each stand as a paragraph of their own (seen
// 2026-11-16, InnovaGoods). This puts them back together for the product page:
// the prose stays prose, the short facts become rows of a table. Display only:
// no word is changed, added or dropped, only grouped.

export type Fact = { label: string | null; values: string[] };
export type DescriptionBlock = { kind: "text"; text: string } | { kind: "facts"; facts: Fact[] };

/** A label on its own line: "Materiaal:". */
const TITLE_MAX = 60;
/** A list item on its own line: "Polyester". */
const ITEM_MAX = 60;
/** "Kleur: Groen" — the part before the colon. */
const KEY_MAX = 50;
/** "Verpakking en handleiding in 24 talen: Engels, Frans, …" — the part after it. */
const VALUE_MAX = 240;

/**
 * More than one sentence: prose ("…, ademend: onze stoel is perfect. De zitting …"). A capital after the full stop,
 * so an abbreviation is no sentence end ("Max. ondersteunt gewicht", "Gesch. afmetingen").
 */
const isProse = (s: string) => /[.!?]\s+\p{Lu}|;\s/u.test(s);

function asTitle(p: string): string | null {
  return p.endsWith(":") && p.length <= TITLE_MAX && !p.slice(0, -1).includes(":") ? p.slice(0, -1).trim() : null;
}

function asKeyValue(p: string): Fact | null {
  const at = p.indexOf(":");
  if (at <= 0) return null;
  const key = p.slice(0, at).trim();
  const value = p.slice(at + 1).trim();
  if (!value || key.length > KEY_MAX || value.length > VALUE_MAX || isProse(key) || isProse(value)) return null;
  return { label: key, values: [value] };
}

const asItem = (p: string) => (p.length <= ITEM_MAX && !p.includes(":") && !isProse(p) ? p : null);

export function structureDescription(paragraphs: string[]): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  const facts = (): Fact[] => {
    const last = blocks.at(-1);
    if (last?.kind === "facts") return last.facts;
    const next: DescriptionBlock = { kind: "facts", facts: [] };
    blocks.push(next);
    return next.facts;
  };
  // The titled row that plain items still join ("Materiaal:" → "Polyester", "IJzer").
  let open: Fact | null = null;

  for (const p of paragraphs) {
    const title = asTitle(p);
    if (title !== null) {
      open = { label: title, values: [] };
      facts().push(open);
      continue;
    }
    const item = asItem(p);
    if (item !== null && open) {
      open.values.push(item);
      continue;
    }
    const kv = asKeyValue(p);
    if (kv) {
      open = null;
      facts().push(kv);
      continue;
    }
    open = null;
    if (item !== null && blocks.at(-1)?.kind === "facts") {
      facts().push({ label: null, values: [item] });
      continue;
    }
    blocks.push({ kind: "text", text: p });
  }
  // A title that no item followed is a line of text again, as it came: nothing is dropped.
  const out: DescriptionBlock[] = [];
  for (const b of blocks) {
    if (b.kind === "text") {
      out.push(b);
      continue;
    }
    for (const f of b.facts) {
      if (f.values.length) {
        const last = out.at(-1);
        if (last?.kind === "facts") last.facts.push(f);
        else out.push({ kind: "facts", facts: [f] });
      } else {
        out.push({ kind: "text", text: `${f.label}:` });
      }
    }
  }
  return out;
}
