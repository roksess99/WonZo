// One style for every mail (docs/MAIL.md § Één gedeelde stijl): the brand
// colours of docs/BRAND.md as literal values (a mail client knows no CSS
// variables), the font stack, and the one escaping function every value goes
// through before it is HTML.

export const MAIL = {
  background: "#faf6f0",
  surface: "#ffffff",
  text: "#1d1a17",
  muted: "#6b635a",
  line: "#e6ded3",
  petrol: "#0e4d4a",
  onPetrol: "#ffffff",
  accent: "#c8440c",
  danger: "#a11d33",
  font: "'DM Sans', Arial, Helvetica, sans-serif",
  width: 640,
} as const;

/** Every value that goes into a mail's HTML: a name with a "<" in it never becomes markup (docs/MAIL.md § Techniek). */
export function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** A link: an absolute URL that says where it goes, escaped. */
export function link(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${MAIL.petrol};text-decoration:underline;">${escapeHtml(label)}</a>`;
}
