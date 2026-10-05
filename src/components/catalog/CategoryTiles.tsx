import Link from "next/link";
import { assortment } from "@/lib/catalog/assortment";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { ChevronIcon } from "../icons";

const TILE_IMAGES: Record<string, string> = {
  wonen: "/mock/shelf.svg",
  tuin: "/mock/parasol.svg",
  buitenleven: "/mock/chair.svg",
  dieren: "/mock/leash.svg",
};

/**
 * Main categories as image tiles with text (docs/SCHERMEN.md § Home,
 * docs/ONDERZOEK.md): calmer than a deep menu, and large touch targets.
 */
export function CategoryTiles({ locale, m }: { locale: Locale; m: Messages }) {
  return (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {assortment.map((c) => {
        const name = m.categories[c.key as keyof Messages["categories"]].name;
        return (
          <li key={c.key}>
            <Link
              href={localizePath(locale, `/${c.slug[locale]}`)}
              className="flex h-full flex-col overflow-hidden rounded-md bg-surface ring-1 ring-line transition-shadow hover:shadow-md"
            >
              {/* Decorative: the name below says where the tile goes. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- local mock SVG */}
              <img src={TILE_IMAGES[c.key]} alt="" className="aspect-[4/3] w-full bg-brand-soft/50 object-contain p-6" />
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
