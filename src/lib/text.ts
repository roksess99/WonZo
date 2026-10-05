// Small, pure text helpers.

/** "Kruidenrek Bamboe (3 Stuks)" → "kruidenrek-bamboe-3-stuks". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * Supplier HTML → plain paragraphs. Supplier text counts as "from outside"
 * (.claude/rules/beveiliging.md), so it is never rendered as HTML: tags are
 * dropped, line breaks and paragraphs are kept, entities decoded.
 */
export function htmlToParagraphs(html: string): string[] {
  const text = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/?\s*(p|div|li|ul|ol|h[1-6])\b[^>]*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]*\n[ \t]*/g, "\n").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

/** For search: lowercase, no diacritics. */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** "Nog {count} stuks" with { count: 3 } → "Nog 3 stuks". */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? String(values[key]) : m));
}
