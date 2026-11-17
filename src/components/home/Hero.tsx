import Image from "next/image";
import Link from "next/link";
import { assortment } from "@/lib/catalog/assortment";
import { SHOWCASE_SIZE, type Showcase } from "@/lib/catalog/showcase";
import type { Product } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n/config";
import { t, type Messages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { formatMoney } from "@/lib/money";
import { ChevronIcon } from "../icons";
import { SearchForm } from "../layout/Header";
import { Container } from "../ui";

/**
 * The hero of the home page (docs/SCHERMEN.md § Home). Left, the one primary
 * action: the big search field, above the fold. Right, the "banner": the
 * products in a running promotion (D-08) or, without promotions, a few that
 * are surely deliverable — never an empty block and never "deals soon". Not a
 * carousel: nothing moves by itself. The left side is plain HTML and stands
 * at once; the right side (`panel`) is loaded by the page in its own
 * boundary, with PanelSkeleton at the same size so nothing jumps, and is left
 * out when the catalogue is unavailable — the hero stays.
 */
export function Hero({ locale, m, panel }: { locale: Locale; m: Messages; panel: React.ReactNode }) {
  return (
    // overflow-clip, not -hidden: it clips the decorative shapes, but the section never becomes a scroll box that
    // focus or scrollIntoView can shift (seen 2026-11-16: a hidden scroll of 128px). Nothing in the hero opens a panel outside it.
    <section aria-labelledby="home-title" className="relative overflow-clip bg-brand-soft/60">
      {/* Decoration in the brand colours, from the tokens, so it follows the theme. */}
      <div aria-hidden="true" className="pointer-events-none absolute -end-24 -top-24 size-80 rounded-full bg-accent/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -start-16 size-72 rounded-full bg-petrol/10 blur-3xl" />
      <Container className="relative grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        <div className="flex flex-col gap-5">
          {/* The main groups in one line, from the category names: what the shop sells, at a glance. */}
          <p className="text-label uppercase tracking-wide text-muted">
            {assortment.map((c) => m.categories[c.key as keyof Messages["categories"]].name).join(" · ")}
          </p>
          <h1 id="home-title" className="max-w-2xl font-display text-h1 font-bold sm:text-display">
            {m.home.title}
          </h1>
          <p className="max-w-prose text-body">{m.home.intro}</p>
          <div className="max-w-xl">
            <SearchForm locale={locale} m={m} big />
          </div>
        </div>
        {panel}
      </Container>
    </section>
  );
}

/** The products beside the search: "on offer now", or "featured" when no promotion runs. */
export function ShowcasePanel({ showcase, locale, m }: { showcase: Showcase; locale: Locale; m: Messages }) {
  const { kind, products } = showcase;
  if (!products.length) return null;
  const title = kind === "promotions" ? m.home.dealsTitle : m.home.featuredTitle;
  return (
    <aside aria-labelledby="home-showcase" className="rounded-md bg-surface p-4 shadow-sm ring-1 ring-line sm:p-5">
      <h2 id="home-showcase" className="font-display text-h2">
        {title}
      </h2>
      <p className="mt-1 text-body-sm text-muted">{kind === "promotions" ? m.home.dealsIntro : m.home.featuredIntro}</p>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {products.map((p, i) => (
          <li key={`${p.source}:${p.id}`}>
            <ShowcaseItem product={p} locale={locale} m={m} priority={i === 0} />
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** One product in the hero: photo, name, price and — only when there is one — the discount actually given. The row is one link. */
function ShowcaseItem({ product, locale, m, priority }: { product: Product; locale: Locale; m: Messages; priority: boolean }) {
  const photo = product.imageUrls[0];
  return (
    <article className="relative flex items-center gap-4 py-3">
      <div className={`relative size-20 shrink-0 overflow-hidden rounded-md ring-1 ring-line ${photo ? "bg-photo" : "bg-background"}`}>
        {photo ? <Image src={photo} alt="" fill sizes="80px" priority={priority} unoptimized={photo.endsWith(".svg")} className="object-contain p-1" /> : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="line-clamp-2 text-body font-medium">
          {/* The whole row is the link (after: overlay); its focus ring sits on that overlay, around the row. The link's own
              ring is off with "!": the global :focus-visible rule (globals.css) is outside Tailwind's layers and would
              otherwise draw it around each line of the name as well. */}
          <Link
            href={localizePath(locale, `/product/${product.slug}`)}
            className="after:absolute after:inset-0 after:rounded-md hover:underline hover:underline-offset-4 focus-visible:outline-none! focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--focus)] focus-visible:after:outline"
          >
            {product.name}
          </Link>
        </h3>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-price font-bold tabular-nums">{formatMoney(product.price)}</span>
          {/* The discount actually given, rounded down; no "was" price without 30 days of history (docs/PRIJZEN.md § 2). */}
          {product.promotion && product.promotion.shownPercent > 0 ? (
            <span className="rounded-sm bg-brand-soft px-2 py-0.5 text-body-sm font-bold text-foreground ring-1 ring-border">{t(m.product.promotionFlag, { percent: product.promotion.shownPercent })}</span>
          ) : null}
        </p>
      </div>
      <ChevronIcon className="size-5 shrink-0 text-muted" />
    </article>
  );
}

/** The panel's size while the catalogue loads: the same rows, so the page does not jump. */
export function PanelSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="rounded-md bg-surface p-4 shadow-sm ring-1 ring-line sm:p-5">
      <div className="h-7 w-48 rounded-sm bg-line" />
      <div className="mt-2 h-4 w-64 max-w-full rounded-sm bg-line" />
      <ul className="mt-2 flex flex-col divide-y divide-line" aria-hidden="true">
        {Array.from({ length: SHOWCASE_SIZE }, (_, i) => (
          <li key={i} className="flex items-center gap-4 py-3">
            <div className="size-20 shrink-0 rounded-md bg-line" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-3/4 rounded-sm bg-line" />
              <div className="h-5 w-20 rounded-sm bg-line" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
