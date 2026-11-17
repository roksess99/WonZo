"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { formatMoney, type Money } from "@/lib/money";
import { quoteReturn, RETURN_REASONS, type ReturnableOrder, type ReturnLineError, type ReturnReason } from "@/lib/returns/amount";
import { interpolate } from "@/lib/text";

type Labels = Messages["returns"];

type FormLine = { lineNo: number; name: string; sku: string; bought: number; returned: number; unitPrice: Money; largeShipping: Money | null };
/** `at`: when it was looked up — the moment the window is judged by in the browser (the server judges again at sending). */
type Found = { reference: string; invoice: string; lines: FormLine[]; order: ReturnableOrder; withdrawalEndsAt: Date | null; at: Date };
type Choice = { quantity: number; reason: ReturnReason | "" };

async function post(body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch("/api/returns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, data: ((await res.json().catch(() => ({}))) as Record<string, unknown>) ?? {} };
  } catch {
    return { status: 0, data: {} };
  }
}

/** Dates come back from JSON as text. */
function revive(x: Record<string, unknown>, at: Date): Found {
  const f = x as unknown as Omit<Found, "at"> & { order: ReturnableOrder & { deliveredAt: string | null }; withdrawalEndsAt: string | null };
  return { ...f, order: { ...f.order, deliveredAt: f.order.deliveredAt ? new Date(f.order.deliveredAt) : null }, withdrawalEndsAt: f.withdrawalEndsAt ? new Date(f.withdrawalEndsAt) : null, at };
}

const emailOk = (e: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e.trim()) && e.trim().length <= 254;
const invoiceOk = (i: string) => /^\d{4}-\d{5}$/.test(i.trim());

/**
 * The return form (D-09, owner 2026-10-13): the e-mail address of the order
 * and the invoice number, then per line the pieces and a reason, with the
 * amount shown as it is chosen — from the same function the server uses
 * (src/lib/returns/amount.ts). The server checks everything again.
 */
export function ReturnForm({ locale, labels: m, contactEmail }: { locale: Locale; labels: Labels; contactEmail: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [invoice, setInvoice] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverLineErrors, setServerLineErrors] = useState<Record<number, string>>({});
  const [done, setDone] = useState<{ number: string; total: Money } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A new step moves the focus to its heading, so a screen reader hears where it is.
  useEffect(() => {
    if (found || done) headingRef.current?.focus();
  }, [found, done]);

  const fail = (status: number, data: Record<string, unknown>) => {
    if (status === 429) return setMessage(m.rateLimit);
    if (data.kind === "not-found") return setMessage(interpolate(m.notFound, { email: contactEmail }));
    if (data.kind === "not-returnable") {
      const why = data.why;
      return setMessage(why === "open-return" ? m.openReturn : why === "nothing-left" ? m.nothingLeft : interpolate(m.notReturnable, { email: contactEmail }));
    }
    setMessage(m.error);
  };

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setMessage(null);
    if (!emailOk(email) || !invoiceOk(invoice) || busy) return;
    setBusy(true);
    const r = await post({ action: "lookup", email, invoice, locale });
    setBusy(false);
    if (r.status === 200 && r.data.kind === "found" && typeof r.data.form === "object" && r.data.form) {
      const f = revive(r.data.form as Record<string, unknown>, new Date());
      setFound(f);
      setChoices(Object.fromEntries(f.lines.map((l) => [l.lineNo, { quantity: 0, reason: "" }])));
      setSubmitted(false);
      setServerLineErrors({});
    } else fail(r.status, r.data);
  }

  const request = found ? found.lines.map((l) => ({ lineNo: l.lineNo, quantity: choices[l.lineNo]?.quantity ?? 0, reason: (choices[l.lineNo]?.reason || "invalid") as ReturnReason })) : [];
  const quote = found ? quoteReturn(found.order, request, found.at) : null;
  const chosen = request.filter((r) => r.quantity > 0);
  const lineErrors: Record<number, ReturnLineError | string> = { ...(quote && !quote.ok ? quote.lines : {}), ...serverLineErrors };
  const errorFor = (e: ReturnLineError | string | undefined) => (e === "reason" ? m.errorReason : e === "window" ? m.errorWindow : e === "quantity" ? m.errorQuantity : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setMessage(null);
    if (!found || !quote || !quote.ok || note.length > 500 || busy) return;
    setBusy(true);
    const r = await post({ action: "submit", email, invoice, locale, note, lines: chosen });
    setBusy(false);
    if (r.status === 200 && r.data.kind === "requested") {
      setDone({ number: String(r.data.number), total: r.data.total as Money });
      setFound(null);
    } else if (r.data.kind === "invalid" && r.data.lines && typeof r.data.lines === "object") {
      setServerLineErrors(r.data.lines as Record<number, string>);
    } else fail(r.status, r.data);
  }

  const field = "min-h-11 rounded-md border border-border bg-surface px-3 text-foreground";
  const button = "min-h-11 rounded-md px-5 font-medium";
  const date = (d: Date) => new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(d);

  if (done) {
    return (
      <section aria-labelledby={`${id}-done`} className="flex flex-col gap-3 rounded-md bg-success-soft p-6">
        <h2 id={`${id}-done`} ref={headingRef} tabIndex={-1} className="font-display text-h2">
          {m.doneTitle}
        </h2>
        <p className="tabular-nums">{interpolate(m.doneText, { number: done.number })}</p>
        <ol className="list-decimal ps-6">
          <li>{m.step1}</li>
          <li>{m.step2}</li>
          <li>{m.step3}</li>
        </ol>
        <p className="tabular-nums">{interpolate(m.doneMax, { amount: formatMoney(done.total) })}</p>
      </section>
    );
  }

  if (found) {
    const emptyError = submitted && quote && !quote.ok && quote.error === "empty";
    return (
      <form onSubmit={submit} noValidate className="flex flex-col gap-6" aria-labelledby={`${id}-choose`}>
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-choose`} ref={headingRef} tabIndex={-1} className="font-display text-h2">
            {m.chooseTitle}
          </h2>
          <p className="tabular-nums">{interpolate(m.chooseIntro, { reference: found.reference })}</p>
          <p className="text-body-sm text-muted">
            {found.withdrawalEndsAt === null ? null : found.withdrawalEndsAt.getTime() >= found.at.getTime() ? interpolate(m.withdrawalUntil, { date: date(found.withdrawalEndsAt) }) : m.withdrawalClosed}
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-line rounded-md bg-surface ring-1 ring-line">
          {found.lines.map((l) => {
            const left = l.bought - l.returned;
            const c = choices[l.lineNo] ?? { quantity: 0, reason: "" };
            const err = c.quantity > 0 && (submitted || serverLineErrors[l.lineNo]) ? errorFor(lineErrors[l.lineNo]) : null;
            const errId = `${id}-err-${l.lineNo}`;
            return (
              <li key={l.lineNo} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-body-sm text-muted tabular-nums">
                    {interpolate(m.price, { price: formatMoney(l.unitPrice) })} · {interpolate(m.sku, { sku: l.sku })}
                  </span>
                  {l.returned ? <span className="text-body-sm text-muted tabular-nums">{interpolate(m.alreadyReturned, { count: l.returned })}</span> : null}
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${id}-q-${l.lineNo}`} className="text-body-sm font-medium">
                      {m.quantity}
                    </label>
                    <select
                      id={`${id}-q-${l.lineNo}`}
                      value={c.quantity}
                      disabled={left === 0}
                      onChange={(e) => setChoices((x) => ({ ...x, [l.lineNo]: { ...c, quantity: Number(e.target.value) } }))}
                      aria-describedby={err ? errId : undefined}
                      className={`${field} tabular-nums`}
                    >
                      {Array.from({ length: left + 1 }, (_, n) => (
                        <option key={n} value={n} className="bg-surface text-foreground">
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  {c.quantity > 0 ? (
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${id}-r-${l.lineNo}`} className="text-body-sm font-medium">
                        {m.reason}
                      </label>
                      <select
                        id={`${id}-r-${l.lineNo}`}
                        value={c.reason}
                        onChange={(e) => {
                          setChoices((x) => ({ ...x, [l.lineNo]: { ...c, reason: e.target.value as ReturnReason | "" } }));
                          setServerLineErrors((s) => Object.fromEntries(Object.entries(s).filter(([k]) => Number(k) !== l.lineNo)));
                        }}
                        aria-invalid={err ? true : undefined}
                        aria-describedby={err ? errId : undefined}
                        className={field}
                      >
                        <option value="" className="bg-surface text-foreground">
                          {m.reasonChoose}
                        </option>
                        {RETURN_REASONS.map((r) => (
                          <option key={r} value={r} className="bg-surface text-foreground">
                            {m.reasons[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {err ? (
                    <p id={errId} className="w-full text-body-sm font-medium text-danger">
                      {err}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-note`} className="font-medium">
            {m.note}
          </label>
          <textarea
            id={`${id}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            aria-describedby={`${id}-note-hint`}
            className="rounded-md border border-border bg-surface px-3 py-2 text-foreground"
          />
          <p id={`${id}-note-hint`} className="text-body-sm text-muted">
            {note.length > 500 ? m.noteTooLong : m.noteHint}
          </p>
        </div>

        <section aria-labelledby={`${id}-sum`} aria-live="polite" className="flex flex-col gap-1 rounded-md bg-surface p-4 tabular-nums ring-1 ring-line">
          <h3 id={`${id}-sum`} className="font-medium">
            {m.summaryTitle}
          </h3>
          {quote?.ok ? (
            <>
              <p>{interpolate(m.summaryLines, { amount: formatMoney(quote.lines) })}</p>
              {quote.shipping.amount > 0 ? <p>{interpolate(m.summaryShipping, { amount: formatMoney(quote.shipping) })}</p> : null}
              <p className="text-h2 font-bold">{interpolate(m.summaryTotal, { amount: formatMoney(quote.total) })}</p>
            </>
          ) : (
            <p className="text-muted">{m.summaryNone}</p>
          )}
          <p className="text-body-sm text-muted">{m.summaryNote}</p>
        </section>

        {emptyError ? (
          <p role="alert" className="font-medium text-danger">
            {m.errorEmpty}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <button type="submit" aria-disabled={busy || undefined} className={`${button} bg-accent font-bold text-accent-contrast`}>
            {busy ? m.busy : m.submit}
          </button>
          <button type="button" onClick={() => setFound(null)} className={`${button} bg-surface ring-1 ring-border`}>
            {m.back}
          </button>
        </div>
        <p role="status" className="text-warning">
          {message ?? ""}
        </p>
      </form>
    );
  }

  const emailError = touched && !emailOk(email) ? m.emailInvalid : null;
  const invoiceError = touched && !invoiceOk(invoice) ? m.invoiceInvalid : null;
  return (
    <form onSubmit={find} noValidate className="flex flex-col gap-4" aria-labelledby={`${id}-find`}>
      <h2 id={`${id}-find`} className="font-display text-h2">
        {m.findTitle}
      </h2>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-email`} className="font-medium">
          {m.email}
        </label>
        <input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? `${id}-email-error` : undefined}
          className={`${field} max-w-md`}
        />
        {emailError ? (
          <p id={`${id}-email-error`} className="text-body-sm font-medium text-danger">
            {emailError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-invoice`} className="font-medium">
          {m.invoice}
        </label>
        <input
          id={`${id}-invoice`}
          inputMode="numeric"
          autoComplete="off"
          value={invoice}
          onChange={(e) => setInvoice(e.target.value)}
          aria-invalid={invoiceError ? true : undefined}
          aria-describedby={`${id}-invoice-hint${invoiceError ? ` ${id}-invoice-error` : ""}`}
          className={`${field} max-w-xs tabular-nums`}
        />
        <p id={`${id}-invoice-hint`} className="max-w-prose text-body-sm text-muted">
          {m.invoiceHint}
        </p>
        {invoiceError ? (
          <p id={`${id}-invoice-error`} className="text-body-sm font-medium text-danger">
            {invoiceError}
          </p>
        ) : null}
      </div>
      <div>
        <button type="submit" aria-disabled={busy || undefined} className={`${button} bg-petrol font-bold text-on-petrol`}>
          {busy ? m.busy : m.find}
        </button>
      </div>
      <p role="status" className="max-w-prose text-warning">
        {message ?? ""}
      </p>
    </form>
  );
}
