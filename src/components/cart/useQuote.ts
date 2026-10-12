"use client";

import { useEffect, useState } from "react";
import type { CartLine } from "@/lib/cart/cart";
import type { CartQuote } from "@/lib/cart/quote";
import type { Locale } from "@/lib/i18n/config";

export type QuoteResult = { kind: "ok"; quote: CartQuote } | { kind: "error" } | { kind: "unavailable" };

/**
 * What the cart costs now, from the server (POST /api/cart), recalculated on
 * every change. Shared by the cart and the checkout, so both show the same
 * amount. While a change is recalculated the last good quote stays, so the
 * page does not jump.
 */
export function useQuote(lines: CartLine[] | null, locale: Locale) {
  const [result, setResult] = useState<{ key: string; value: QuoteResult } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = lines ? JSON.stringify(lines) : "";

  useEffect(() => {
    if (!lines || lines.length === 0) return;
    const controller = new AbortController();
    const requestKey = JSON.stringify(lines);
    fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale, lines }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status === 503) return setResult({ key: requestKey, value: { kind: "unavailable" } });
        if (!res.ok) return setResult({ key: requestKey, value: { kind: "error" } });
        setResult({ key: requestKey, value: { kind: "ok", quote: (await res.json()) as CartQuote } });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResult({ key: requestKey, value: { kind: "error" } });
      });
    return () => controller.abort();
  }, [lines, locale, attempt]);

  const current = result?.key === key ? result.value : null;
  const quote = current?.kind === "ok" ? current.quote : result?.value.kind === "ok" ? result.value.quote : null;
  return {
    quote,
    current,
    busy: current === null,
    retry: () => {
      setResult(null);
      setAttempt((n) => n + 1);
    },
  };
}
