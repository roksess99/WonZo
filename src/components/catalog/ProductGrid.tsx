import type { Product } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { ProductCard } from "./ProductCard";

/** 2 columns on mobile, 3 on tablet, 4 on desktop (.claude/rules/frontend.md). */
export function ProductGrid({ products, locale, m }: { products: Product[]; locale: Locale; m: Messages }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id}>
          {/* Only the first row loads eagerly. */}
          <ProductCard product={p} locale={locale} m={m} priority={i < 4} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 8, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="flex flex-col gap-3 rounded-md bg-surface p-4 ring-1 ring-line">
            <div className="aspect-square animate-pulse rounded-md bg-line/60" />
            <div className="h-3 w-1/3 animate-pulse rounded-sm bg-line/60" />
            <div className="h-4 w-full animate-pulse rounded-sm bg-line/60" />
            <div className="h-4 w-2/3 animate-pulse rounded-sm bg-line/60" />
            <div className="h-5 w-1/4 animate-pulse rounded-sm bg-line/60" />
          </li>
        ))}
      </ul>
    </div>
  );
}
