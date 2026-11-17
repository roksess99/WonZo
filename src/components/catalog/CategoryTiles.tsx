import Image from "next/image";
import Link from "next/link";
import { assortment } from "@/lib/catalog/assortment";
import { applyQuery } from "@/lib/catalog/query";
import type { Product } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { ChevronIcon } from "../icons";

/** Drawings for when there is no real photo (the mock catalogue, or a category without photos). */
const TILE_IMAGES: Record<string, string> = {
  wonen: "/mock/shelf.svg",
  tuin: "/mock/parasol.svg",
  buitenleven: "/mock/chair.svg",
  sport: "/mock/dumbbell.svg",
  dieren: "/mock/leash.svg",
};

/**
 * The product whose photo the owner chose for a tile (2026-10-15): what says
 * "wonen", "tuin" or "buiten" at a glance. Only used while it is for sale;
 * otherwise the tile falls back to the automatic choice below.
 */
const CHOSEN: Record<string, string> = {
  wonen: "118538", // Bamboe opklapbare bijzettafel Lapwood
  tuin: "1296134", // Strandparasol Marbueno Summer, rood
  buitenleven: "822285", // Inklapbare campingstoel Folstul
};

/**
 * Per main category the photo of a product that is really for sale in it
 * (owner 2026-10-15): the product the owner chose for it, or else the first
 * one with a photo in the order the category page shows ("recommended"). The
 * mock catalogue has drawings, not photos: then the drawing stays. Pure.
 */
export function categoryCovers(catalog: Product[], chosen: Record<string, string> = CHOSEN): Record<string, string> {
  const covers: Record<string, string> = {};
  const ordered = applyQuery(catalog, { sort: "recommended" });
  const hasPhoto = (x: Product) => x.imageUrls.some((u) => !u.endsWith(".svg"));
  for (const c of assortment) {
    const pick = ordered.find((x) => x.id === chosen[c.key] && x.categoryKey === c.key && hasPhoto(x));
    const p = pick ?? ordered.find((x) => x.categoryKey === c.key && hasPhoto(x));
    const url = p?.imageUrls.find((u) => !u.endsWith(".svg"));
    if (url) covers[c.key] = url;
  }
  return covers;
}

/**
 * Main categories as image tiles with text (docs/SCHERMEN.md § Home,
 * docs/ONDERZOEK.md): calmer than a deep menu, and large touch targets.
 */
export function CategoryTiles({ locale, m, covers = {} }: { locale: Locale; m: Messages; covers?: Record<string, string> }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {assortment.map((c, i) => {
        const name = m.categories[c.key as keyof Messages["categories"]].name;
        const photo = covers[c.key];
        // An odd last tile on a phone takes the whole row, lower, instead of standing alone.
        const wide = i === assortment.length - 1 && assortment.length % 2 === 1;
        const shape = wide ? "aspect-[4/3] max-sm:aspect-[8/3]" : "aspect-[4/3]";
        return (
          <li key={c.key} className={wide ? "max-sm:col-span-2" : undefined}>
            <Link
              href={localizePath(locale, `/${c.slug[locale]}`)}
              className="flex h-full flex-col overflow-hidden rounded-md bg-surface ring-1 ring-line transition-shadow hover:shadow-md"
            >
              {/* Decorative: the name below says where the tile goes. */}
              {photo ? (
                // A product photo on white, whole (object-contain), like everywhere in the shop (docs/BRAND.md § Beeld).
                <span className={`relative block ${shape} w-full bg-surface`}>
                  <Image src={photo} alt="" fill sizes={wide ? "(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 100vw" : "(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"} priority={i < 2} className="object-contain p-4" />
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- local mock SVG
                <img src={TILE_IMAGES[c.key]} alt="" className={`${shape} w-full bg-brand-soft/50 object-contain p-6`} />
              )}
              <span className="flex min-h-11 items-center justify-between gap-2 p-4 font-display text-h2">
                {name}
                <ChevronIcon className="size-5 text-muted" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
