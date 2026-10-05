"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MAX_QUANTITY, type CartLine } from "@/lib/cart/cart";
import type { CartQuote, QuoteLine } from "@/lib/cart/quote";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { formatMoney } from "@/lib/money";
import { interpolate } from "@/lib/text";
import { ProductImage } from "../catalog/ProductImage";
import { AlertIcon, CloseIcon, InfoIcon, TruckIcon } from "../icons";
import { StateMessage } from "../ui";
import { QuantityStepper, type StepperLabels } from "./QuantityStepper";
import { cartActions, useCart } from "./store";

export type CartLabels = StepperLabels & {
  loading: string;
  updating: string;
  itemsLabel: string;
  emptyTitle: string;
  emptyText: string;
  emptyAction: string;
  errorTitle: string;
  errorText: string;
  retry: string;
  unavailableTitle: string;
  unavailableText: string;
  sku: string;
  perPiece: string;
  remove: string;
  removeNamed: string;
  limited: string;
  limitedOne: string;
  fixQuantity: string;
  gone: string;
  goneName: string;
  summaryTitle: string;
  subtotal: string;
  subtotalOne: string;
  shipping: string;
  shippingLarge: string;
  shippingFree: string;
  remainingForFree: string;
  largeItem: string;
  total: string;
  inclVat: string;
  delivery: string;
  shipsFrom: string;
  checkout: string;
  checkoutNotYet: string;
  resolveFirst: string;
  continueShopping: string;
  noImage: string;
  countries: Record<string, string>;
};

type Result = { kind: "ok"; quote: CartQuote } | { kind: "error" } | { kind: "unavailable" };

const sameRef = (a: Pick<CartLine, "source" | "productId">, b: Pick<CartLine, "source" | "productId">) =>
  a.source === b.source && a.productId === b.productId;

/**
 * The cart: confirm that it is right (docs/SCHERMEN.md § Winkelwagen). The
 * browser knows only references; every price on this screen comes from the
 * quote endpoint, recalculated on each change.
 */
export function CartView({ locale, labels }: { locale: Locale; labels: CartLabels }) {
  const lines = useCart();
  const [result, setResult] = useState<{ key: string; value: Result } | null>(null);
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

  const shopHref = localizePath(locale, "/");

  // Not known yet (server render, before hydration): a loading state, not "empty".
  if (lines === null) return <Loading label={labels.loading} />;
  if (lines.length === 0) {
    return <StateMessage title={labels.emptyTitle} text={labels.emptyText} action={{ href: shopHref, label: labels.emptyAction }} />;
  }

  const current = result?.key === key ? result.value : null;
  // Keep showing the last good quote while a change is recalculated, so the page does not jump.
  const quote = current?.kind === "ok" ? current.quote : result?.value.kind === "ok" ? result.value.quote : null;
  const busy = current === null;

  if (!quote) {
    if (current?.kind === "unavailable" || current?.kind === "error") {
      const unavailable = current.kind === "unavailable";
      return (
        <StateMessage
          tone="warning"
          title={unavailable ? labels.unavailableTitle : labels.errorTitle}
          text={unavailable ? labels.unavailableText : labels.errorText}
        >
          <p>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setAttempt((n) => n + 1);
              }}
              className="min-h-11 rounded-md bg-petrol px-4 font-medium text-on-petrol"
            >
              {labels.retry}
            </button>
          </p>
        </StateMessage>
      );
    }
    return <Loading label={labels.loading} />;
  }

  // Lines in the order of the cart; a line the quote does not know yet waits for the next answer.
  const shown = lines
    .map((line) => ({ line, quoted: quote.lines.find((q) => sameRef(q, line)) }))
    .filter((x): x is { line: CartLine; quoted: QuoteLine } => x.quoted !== undefined);
  const hasProblems = shown.some(({ quoted }) => quoted.status !== "ok");

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
      <ul aria-label={labels.itemsLabel} aria-busy={busy} className="flex flex-col divide-y divide-line rounded-md bg-surface ring-1 ring-line">
        {shown.map(({ line, quoted }) => (
          <CartRow key={`${line.source}:${line.productId}`} locale={locale} line={line} quoted={quoted} labels={labels} />
        ))}
      </ul>

      <section aria-labelledby="cart-summary" aria-busy={busy} className="flex flex-col gap-4 rounded-md bg-surface p-6 ring-1 ring-line">
        <h2 id="cart-summary" className="font-display text-h2">
          {labels.summaryTitle}
        </h2>
        <div className={`flex flex-col gap-2 tabular-nums ${busy ? "opacity-60" : ""}`}>
          <dl className="flex flex-col gap-2">
            <div className="flex justify-between gap-4">
              <dt>{quote.itemCount === 1 ? labels.subtotalOne : interpolate(labels.subtotal, { count: quote.itemCount })}</dt>
              <dd>{formatMoney(quote.subtotal)}</dd>
            </div>
            {quote.shipping.standard.kind !== "none" ? (
              <div className="flex justify-between gap-4">
                <dt>{labels.shipping}</dt>
                <dd>{quote.shipping.standard.kind === "free" ? labels.shippingFree : formatMoney(quote.shipping.standard.amount)}</dd>
              </div>
            ) : null}
            {quote.shipping.large.amount > 0 ? (
              <div className="flex justify-between gap-4">
                <dt>{labels.shippingLarge}</dt>
                <dd>{formatMoney(quote.shipping.large)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2 font-bold">
              <dt>{labels.total}</dt>
              <dd className="text-h2">{formatMoney(quote.total)}</dd>
            </div>
          </dl>
          {quote.shipping.standard.kind === "fee" ? (
            <p className="text-body-sm">{interpolate(labels.remainingForFree, { amount: formatMoney(quote.shipping.standard.remainingForFree) })}</p>
          ) : null}
          <p className="text-body-sm text-muted">{labels.inclVat}</p>
        </div>
        {quote.delivery ? (
          <p className="flex items-start gap-2 text-body-sm">
            <TruckIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              {interpolate(labels.delivery, { min: quote.delivery.minWorkingDays, max: quote.delivery.maxWorkingDays })}
              {" · "}
              {interpolate(labels.shipsFrom, { country: quote.delivery.shipsFrom.map((c) => labels.countries[c] ?? c).join(", ") })}
            </span>
          </p>
        ) : null}
        {/* A button that cannot act says why (.claude/rules/frontend.md): checkout arrives with payments. */}
        <button
          type="button"
          aria-disabled="true"
          aria-describedby="checkout-status"
          className="min-h-12 w-full cursor-not-allowed rounded-md bg-line px-6 text-body font-bold text-foreground"
        >
          {labels.checkout}
        </button>
        <p id="checkout-status" role="status" className="text-body-sm text-muted">
          {hasProblems ? labels.resolveFirst : labels.checkoutNotYet}
        </p>
        <Link href={shopHref} className="inline-flex min-h-11 items-center font-medium underline decoration-2 underline-offset-4">
          {labels.continueShopping}
        </Link>
        <span className="sr-only" role="status">
          {busy ? labels.updating : ""}
        </span>
      </section>
    </div>
  );
}

function CartRow({ locale, line, quoted, labels }: { locale: Locale; line: CartLine; quoted: QuoteLine; labels: CartLabels }) {
  const ref = { source: line.source, productId: line.productId };
  const removeButton = (name: string) => (
    <button
      type="button"
      onClick={() => cartActions.remove(ref)}
      aria-label={interpolate(labels.removeNamed, { name })}
      className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-body-sm font-medium underline-offset-4 hover:underline"
    >
      <CloseIcon className="size-4" />
      {labels.remove}
    </button>
  );

  if (quoted.status === "unavailable") {
    return (
      <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-warning">
          <AlertIcon className="mt-0.5 size-5 shrink-0" />
          <span>{labels.gone}</span>
        </p>
        {removeButton(labels.goneName)}
      </li>
    );
  }

  const p = quoted.product;
  const href = localizePath(locale, `/product/${p.slug}`);
  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex gap-4">
        <Link href={href} className="w-20 shrink-0 sm:w-24" tabIndex={-1} aria-hidden="true">
          <ProductImage src={p.imageUrl ?? undefined} alt="" noImageText={labels.noImage} sizes="96px" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={href} className="font-medium underline-offset-4 hover:underline">
            {p.name}
          </Link>
          <p className="text-body-sm text-muted tabular-nums">{interpolate(labels.sku, { sku: p.sku })}</p>
          <p className="text-body-sm tabular-nums">{interpolate(labels.perPiece, { price: formatMoney(quoted.unitPrice) })}</p>
          <p className="flex items-start gap-1.5 text-body-sm">
            <TruckIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              {interpolate(labels.delivery, { min: p.delivery.minWorkingDays, max: p.delivery.maxWorkingDays })}
              {" · "}
              {interpolate(labels.shipsFrom, { country: labels.countries[p.delivery.shipsFrom] ?? p.delivery.shipsFrom })}
            </span>
          </p>
          {quoted.largeShipping ? (
            <p className="text-body-sm text-muted tabular-nums">{interpolate(labels.largeItem, { cost: formatMoney(quoted.largeShipping) })}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <QuantityStepper
            id={`cart-qty-${line.productId}`}
            value={line.quantity}
            max={Math.min(p.stock, MAX_QUANTITY)}
            onChange={(n) => cartActions.setQuantity(ref, n)}
            labels={labels}
          />
          {removeButton(p.name)}
        </div>
        <p className="text-h2 font-bold tabular-nums">{formatMoney(quoted.lineTotal)}</p>
      </div>
      {quoted.status === "limited" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-warning-soft p-3 text-body-sm text-warning">
          <InfoIcon className="size-4 shrink-0" />
          <span>{p.stock === 1 ? labels.limitedOne : interpolate(labels.limited, { stock: p.stock })}</span>
          <button
            type="button"
            onClick={() => cartActions.setQuantity(ref, p.stock)}
            className="min-h-11 rounded-md bg-surface px-3 font-medium text-foreground ring-1 ring-border"
          >
            {interpolate(labels.fixQuantity, { stock: p.stock })}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {[0, 1].map((i) => (
        <div key={i} aria-hidden="true" className="h-32 animate-pulse rounded-md bg-surface ring-1 ring-line motion-reduce:animate-none" />
      ))}
    </div>
  );
}
