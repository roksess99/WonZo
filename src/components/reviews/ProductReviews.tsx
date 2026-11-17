"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { ReviewList } from "./ReviewList";

type Loaded = { summary: { count: number; average: number | null; perStar: number[] }; reviews: { id: number; rating: number; body: string | null; name: string | null; reply: string | null; createdAt: string }[] };

/**
 * The reviews of a product, fetched after the page is shown: the product page
 * stays as fast and as cacheable as it is, and the reviews are never older
 * than a minute (D-12). Loading, empty and failed each say what they are.
 */
export function ProductReviews({ source, productId, locale, m }: { source: string; productId: string; locale: Locale; m: Messages["reviews"] }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ok"; data: Loaded }>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    fetch(`/api/reviews?source=${encodeURIComponent(source)}&product=${encodeURIComponent(productId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Loaded>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => alive && setState({ kind: "ok", data }))
      .catch(() => alive && setState({ kind: "error" }));
    return () => {
      alive = false;
    };
  }, [source, productId]);
  if (state.kind === "loading") return <p className="text-muted" aria-live="polite">{m.loading}</p>;
  if (state.kind === "error") return <p className="text-muted">{m.error}</p>;
  return <ReviewList summary={state.data.summary} reviews={state.data.reviews} locale={locale} m={m} />;
}
