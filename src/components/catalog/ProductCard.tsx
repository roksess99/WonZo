import Link from "next/link";
import type { Product } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n/config";
import { t, type Messages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { formatMoney } from "@/lib/money";
import { CheckIcon, TruckIcon } from "../icons";
import { ProductImage } from "./ProductImage";

type Props = { product: Product; locale: Locale; m: Messages; priority?: boolean };

/**
 * Every card carries the same: image, name, brand, stock, delivery time and
 * price (docs/SCHERMEN.md). No extra buttons — the whole card is one link.
 */
export function ProductCard({ product, locale, m, priority }: Props) {
  const href = localizePath(locale, `/product/${product.slug}`);
  return (
    <article className="group relative flex h-full flex-col gap-3 rounded-md bg-surface p-4 ring-1 ring-line transition-shadow hover:shadow-md">
      <ProductImage
        src={product.imageUrls[0]}
        alt={product.name}
        noImageText={m.product.noImage}
        priority={priority}
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
      />
      <div className="flex flex-1 flex-col gap-1">
        {product.brand ? <p className="text-label uppercase text-muted">{product.brand}</p> : null}
        <h3 className="line-clamp-3 text-body font-medium">
          <Link href={href} className="after:absolute after:inset-0 after:rounded-md focus-visible:outline-none">
            {product.name}
          </Link>
        </h3>
        <p className="mt-auto flex items-center gap-1.5 pt-2 text-body-sm text-in-stock">
          <CheckIcon className="size-4" />
          {m.product.inStock}
        </p>
        <p className="flex items-center gap-1.5 text-body-sm text-muted">
          <TruckIcon className="size-4" />
          {t(m.product.delivery, { min: product.delivery.minWorkingDays, max: product.delivery.maxWorkingDays })}
        </p>
        <p className="pt-1 text-price font-bold tabular-nums">{formatMoney(product.price)}</p>
      </div>
    </article>
  );
}
