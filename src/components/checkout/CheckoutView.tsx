"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { formatMoney } from "@/lib/money";
import type { CustomerField, FieldError } from "@/lib/orders/customer";
import type { CodeRefusal } from "@/lib/pricing/codes";
import { interpolate } from "@/lib/text";
import { TruckIcon } from "../icons";
import { StateMessage } from "../ui";
import { codeMessage, type CodeLabels } from "../cart/CodeField";
import { codeActions, useCart, useCode } from "../cart/store";
import { useQuote } from "../cart/useQuote";
import { CustomerFields, EMPTY_CUSTOMER, errorText, FIELD_ORDER, validate, type CustomerFieldLabels, type CustomerValues } from "./CustomerFields";

export type CheckoutLabels = CustomerFieldLabels & CodeLabels & {
  codeProblem: string;
  detailsTitle: string;
  errorSummaryOne: string;
  errorSummary: string;
  summaryTitle: string;
  quantityOf: string;
  withdrawal: string;
  cancelWindow: string;
  terms: string;
  termsLink: string;
  submit: string;
  submitting: string;
  toPayment: string;
  changedTitle: string;
  changedText: string;
  changedAction: string;
  conflict: string;
  error: string;
  rateLimited: string;
  unavailable: string;
  off: string;
  backToCart: string;
  // From the cart
  loading: string;
  emptyTitle: string;
  emptyText: string;
  emptyAction: string;
  subtotal: string;
  subtotalOne: string;
  shipping: string;
  shippingLarge: string;
  shippingFree: string;
  total: string;
  inclVat: string;
  delivery: string;
  resolveFirst: string;
};

type Problem = "changed" | "conflict" | "error" | "rateLimited" | "unavailable" | "off" | { code: CodeRefusal; text: string };

/** A key per checkout attempt, made when the page opens (docs/IDEMPOTENCY.md § Checkout). */
const newAttempt = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "");

/**
 * Checking out: be done as quickly as possible (docs/SCHERMEN.md § Afrekenen).
 * No account, few fields, errors at the field and in a summary, the order
 * overview in view, and before the button: cooling-off period, terms,
 * delivery time and the total once more. Every amount on this screen comes
 * from the server; the server freezes it again when the order is placed.
 */
export function CheckoutView({ locale, labels }: { locale: Locale; labels: CheckoutLabels }) {
  const lines = useCart();
  const code = useCode();
  const { quote, current, busy } = useQuote(lines, locale, code);
  const [values, setValues] = useState<CustomerValues>(EMPTY_CUSTOMER);
  const [touched, setTouched] = useState<Partial<Record<CustomerField, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<CustomerField, FieldError>>>({});
  const [showAll, setShowAll] = useState(false);
  const [sending, setSending] = useState<"no" | "order" | "payment">("no");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [attempt, setAttempt] = useState(newAttempt);
  const summaryRef = useRef<HTMLDivElement>(null);
  const cartHref = localizePath(locale, "/winkelwagen");

  if (lines === null) return <p role="status">{labels.loading}</p>;
  if (lines.length === 0) {
    return <StateMessage title={labels.emptyTitle} text={labels.emptyText} action={{ href: localizePath(locale, "/"), label: labels.emptyAction }} />;
  }
  if (!quote) {
    if (current?.kind === "unavailable" || current?.kind === "error") return <StateMessage tone="warning" title={labels.unavailable} action={{ href: cartHref, label: labels.backToCart }} />;
    return <p role="status">{labels.loading}</p>;
  }
  if (!quote.readyForCheckout) {
    return <StateMessage tone="warning" title={labels.changedTitle} text={labels.resolveFirst} action={{ href: cartHref, label: labels.changedAction }} />;
  }

  const clientErrors = validate(values);
  const shownErrors: Partial<Record<CustomerField, FieldError>> = { ...serverErrors };
  for (const f of FIELD_ORDER) if ((showAll || touched[f]) && clientErrors[f]) shownErrors[f] = clientErrors[f];
  const errorList = FIELD_ORDER.filter((f) => shownErrors[f]);
  const codeNote = code && !busy ? codeMessage(quote, labels) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending !== "no" || !quote) return;
    setProblem(null);
    const errors = validate(values);
    const wrong = FIELD_ORDER.filter((f) => errors[f]);
    if (wrong.length) {
      setShowAll(true);
      setServerErrors({});
      // One error: to that field. More: to the summary, which links to each (docs/ACCESSIBILITY.md).
      if (wrong.length === 1) document.getElementById(`checkout-${wrong[0]}`)?.focus();
      else requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setSending("order");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The code only when the overview showed it applied: a refused code is shown above, and the total without it is what the customer saw.
        body: JSON.stringify({ checkoutAttemptId: attempt, locale, lines, customer: values, expectedTotalCents: quote.total.amount, ...(quote.code?.kind === "applied" ? { discountCode: quote.code.code } : {}) }),
      });
      const body = (await res.json().catch(() => ({}))) as { kind?: string; url?: string; statusUrl?: string; reason?: CodeRefusal; fields?: Partial<Record<CustomerField, FieldError>> };
      if (body.kind === "pay" && body.url) {
        setSending("payment");
        window.location.assign(body.url);
        return;
      }
      if (body.kind === "order" && body.statusUrl?.startsWith("/")) {
        window.location.assign(body.statusUrl);
        return;
      }
      setSending("no");
      if (res.status === 400 && body.fields) {
        setServerErrors(body.fields);
        setShowAll(true);
        requestAnimationFrame(() => summaryRef.current?.focus());
      } else if (body.kind === "code-refused" && body.reason && quote.code) {
        // E.g. used before by this address: known only now. Nothing was placed; the customer chooses.
        setProblem({ code: body.reason, text: interpolate(labels.codeRefused[body.reason], { code: quote.code.code, amount: "" }) });
      } else if (body.kind === "not-ready") setProblem("changed");
      else if (body.kind === "conflict") {
        // The key belongs to an order with other details: this is a new attempt.
        setAttempt(newAttempt());
        setProblem("conflict");
      } else if (res.status === 429) setProblem("rateLimited");
      else if (body.kind === "off") setProblem("off");
      else if (body.kind === "unavailable") setProblem("unavailable");
      else setProblem("error");
    } catch {
      setSending("no");
      setProblem("error");
    }
  }

  const problemText: Record<Exclude<Problem, object>, string> = {
    changed: labels.changedText,
    conflict: labels.conflict,
    error: labels.error,
    rateLimited: labels.rateLimited,
    unavailable: labels.unavailable,
    off: labels.off,
  };

  return (
    <form onSubmit={submit} noValidate className="grid items-start gap-8 lg:grid-cols-[1fr_24rem]">
      <section aria-labelledby="checkout-details" className="flex flex-col gap-4 rounded-md bg-surface p-6 ring-1 ring-line">
        <h2 id="checkout-details" className="font-display text-h2">
          {labels.detailsTitle}
        </h2>
        {errorList.length > 1 ? (
          <div ref={summaryRef} tabIndex={-1} role="alert" className="flex flex-col gap-2 rounded-md bg-danger-soft p-4 text-danger">
            <p className="font-medium">{interpolate(labels.errorSummary, { count: errorList.length })}</p>
            <ul className="list-disc ps-5">
              {errorList.map((f) => (
                <li key={f}>
                  <a href={`#checkout-${f}`} className="underline underline-offset-4">
                    {labels[f as keyof CustomerValues]}: {errorText(f, shownErrors[f]!, labels)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : errorList.length === 1 && showAll ? (
          <div ref={summaryRef} tabIndex={-1} className="sr-only">
            {labels.errorSummaryOne}
          </div>
        ) : null}
        <CustomerFields
          idPrefix="checkout"
          values={values}
          errors={shownErrors}
          labels={labels}
          onChange={(field, value) => {
            setValues((v) => ({ ...v, [field]: value }));
            if (serverErrors[field]) setServerErrors((s) => ({ ...s, [field]: undefined }));
          }}
          onBlur={(field) => setTouched((t) => ({ ...t, [field]: true }))}
        />
      </section>

      {/* The overview stays in view while filling in (docs/SCHERMEN.md). */}
      <section aria-labelledby="checkout-summary" aria-busy={busy} className="flex flex-col gap-4 rounded-md bg-surface p-6 ring-1 ring-line lg:sticky lg:top-4">
        <h2 id="checkout-summary" className="font-display text-h2">
          {labels.summaryTitle}
        </h2>
        <ul className="flex flex-col gap-2 text-body-sm">
          {quote.lines.map((l) =>
            l.status === "unavailable" ? null : (
              <li key={`${l.source}:${l.productId}`} className="flex justify-between gap-4 tabular-nums">
                <span>{interpolate(labels.quantityOf, { quantity: l.quantity, name: l.product.name })}</span>
                <span>{formatMoney(l.lineTotal)}</span>
              </li>
            ),
          )}
        </ul>
        <dl className="flex flex-col gap-2 border-t border-line pt-3 tabular-nums">
          <div className="flex justify-between gap-4">
            <dt>{quote.itemCount === 1 ? labels.subtotalOne : interpolate(labels.subtotal, { count: quote.itemCount })}</dt>
            <dd>{formatMoney(quote.subtotal)}</dd>
          </div>
          {quote.discount.amount > 0 && quote.code?.kind === "applied" ? (
            <div className="flex justify-between gap-4">
              <dt>{interpolate(labels.discount, { code: quote.code.code })}</dt>
              <dd>−{formatMoney(quote.discount)}</dd>
            </div>
          ) : null}
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
        <p className="text-body-sm text-muted">{labels.inclVat}</p>
        {codeNote ? (
          // A code that does not apply is said here, before the button: the total above is without it (docs/PRIJZEN.md § 3).
          <div role={codeNote.tone === "error" ? "alert" : undefined} className={`flex flex-col gap-2 text-body-sm ${codeNote.tone === "error" ? "rounded-md bg-warning-soft p-3 text-warning" : "text-muted"}`}>
            <p>{codeNote.text}</p>
            {codeNote.tone === "error" ? (
              <button type="button" onClick={() => codeActions.clear()} className="min-h-11 self-start font-medium underline underline-offset-4">
                {labels.codeRemove}
              </button>
            ) : null}
          </div>
        ) : null}
        {quote.delivery ? (
          <p className="flex items-start gap-2 text-body-sm">
            <TruckIcon className="mt-0.5 size-4 shrink-0" />
            <span>{interpolate(labels.delivery, { min: quote.delivery.minWorkingDays, max: quote.delivery.maxWorkingDays })}</span>
          </p>
        ) : null}
        <div className="flex flex-col gap-1 text-body-sm">
          <p>{labels.withdrawal}</p>
          <p>{labels.cancelWindow}</p>
          {/* In a new tab: the form keeps what the customer typed. */}
          <p>
            {labels.terms.split("{terms}")[0]}
            <a href={localizePath(locale, "/algemene-voorwaarden")} target="_blank" rel="noopener" className="underline underline-offset-4">
              {labels.termsLink}
            </a>
            {labels.terms.split("{terms}")[1] ?? ""}
          </p>
        </div>
        {problem ? (
          <div role="alert" className="flex flex-col gap-2 rounded-md bg-warning-soft p-3 text-body-sm text-warning">
            <p>{typeof problem === "object" ? interpolate(labels.codeProblem, { reason: problem.text }) : problemText[problem]}</p>
            {problem === "changed" ? (
              <Link href={cartHref} className="font-medium underline underline-offset-4">
                {labels.changedAction}
              </Link>
            ) : null}
            {typeof problem === "object" ? (
              <button
                type="button"
                onClick={() => {
                  codeActions.clear();
                  setProblem(null);
                }}
                className="min-h-11 self-start font-medium underline underline-offset-4"
              >
                {labels.codeRemove}
              </button>
            ) : null}
          </div>
        ) : null}
        <button
          type="submit"
          aria-disabled={sending !== "no" || busy ? true : undefined}
          className={`min-h-12 w-full rounded-md px-6 text-body font-bold ${sending !== "no" || busy ? "cursor-wait bg-line text-foreground" : "bg-accent text-accent-contrast"}`}
        >
          {sending === "order" ? labels.submitting : sending === "payment" ? labels.toPayment : labels.submit}
        </button>
        <span className="sr-only" role="status">
          {sending === "order" ? labels.submitting : sending === "payment" ? labels.toPayment : ""}
        </span>
        <Link href={cartHref} className="inline-flex min-h-11 items-center font-medium underline decoration-2 underline-offset-4">
          {labels.backToCart}
        </Link>
      </section>
    </form>
  );
}
