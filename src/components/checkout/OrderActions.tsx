"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { CustomerField, FieldError } from "@/lib/orders/customer";
import { interpolate } from "@/lib/text";
import { cartActions } from "../cart/store";
import { CustomerFields, validate, type CustomerFieldLabels, type CustomerValues } from "./CustomerFields";

export type OrderActionLabels = CustomerFieldLabels & {
  pay: string;
  payAgain: string;
  cancel: string;
  cancelConfirmTitle: string;
  cancelConfirmText: string;
  cancelYes: string;
  cancelNo: string;
  change: string;
  save: string;
  close: string;
  saved: string;
  windowClosed: string;
  busy: string;
  error: string;
  notNow: string;
};

type Props = {
  token: string;
  locale: Locale;
  canPay: boolean;
  /** Pay again after a failed attempt (other wording). */
  retry: boolean;
  canChange: boolean;
  customer: CustomerValues;
  /** The refund amount for the confirmation step, formatted. */
  refundAmount: string;
  labels: OrderActionLabels;
};

async function act(body: Record<string, unknown>): Promise<{ status: number; kind?: string; url?: string; fields?: Partial<Record<CustomerField, FieldError>> }> {
  try {
    const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, ...((await res.json().catch(() => ({}))) as object) };
  } catch {
    return { status: 0 };
  }
}

/**
 * What the customer can still do (D-04): pay (again), and inside the 30
 * minutes cancel or change their details. Cancelling has a confirmation step
 * that states the exact amount (.claude/rules/beveiliging.md § Destructieve
 * en financiële handelingen). The server checks everything again.
 */
export function OrderActions({ token, locale, canPay, retry, canChange, customer, refundAmount, labels }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(customer);
  const [touched, setTouched] = useState<Partial<Record<CustomerField, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<CustomerField, FieldError>>>({});
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const fail = (status: number, kind?: string) =>
    setMessage({ tone: "warn", text: kind === "window-closed" ? labels.windowClosed : status === 503 || status === 429 ? labels.notNow : labels.error });

  async function pay() {
    setBusy(true);
    const r = await act({ token, locale, action: "pay" });
    if (r.kind === "pay" && r.url) return window.location.assign(r.url);
    setBusy(false);
    if (r.kind === "done") router.refresh();
    else fail(r.status, r.kind);
  }

  async function cancel() {
    setBusy(true);
    const r = await act({ token, locale, action: "cancel" });
    setBusy(false);
    setConfirming(false);
    if (r.kind === "done") router.refresh();
    else fail(r.status, r.kind);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errors = validate(values);
    if (Object.keys(errors).length) {
      setTouched(Object.fromEntries(Object.keys(errors).map((k) => [k, true])));
      return;
    }
    setBusy(true);
    const r = await act({ token, locale, action: "details", customer: values });
    setBusy(false);
    if (r.kind === "done") {
      setEditing(false);
      setMessage({ tone: "ok", text: labels.saved });
      router.refresh();
    } else if (r.fields) setServerErrors(r.fields);
    else fail(r.status, r.kind);
  }

  const clientErrors = validate(values);
  const shown: Partial<Record<CustomerField, FieldError>> = { ...serverErrors };
  for (const [f, e] of Object.entries(clientErrors) as [CustomerField, FieldError][]) if (touched[f]) shown[f] = e;
  const button = "min-h-11 rounded-md px-4 font-medium";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        {canPay ? (
          <button type="button" onClick={pay} aria-disabled={busy || undefined} className={`${button} bg-accent text-accent-contrast`}>
            {busy ? labels.busy : retry ? labels.payAgain : labels.pay}
          </button>
        ) : null}
        {canChange && !confirming ? (
          <>
            <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing} className={`${button} bg-surface ring-1 ring-border`}>
              {labels.change}
            </button>
            <button type="button" onClick={() => setConfirming(true)} className={`${button} bg-surface text-danger ring-1 ring-border`}>
              {labels.cancel}
            </button>
          </>
        ) : null}
      </div>

      {confirming ? (
        <div role="group" aria-labelledby="cancel-title" className="flex flex-col gap-3 rounded-md bg-danger-soft p-4">
          <p id="cancel-title" className="font-medium">
            {labels.cancelConfirmTitle}
          </p>
          <p>{interpolate(labels.cancelConfirmText, { amount: refundAmount })}</p>
          <div className="flex flex-wrap gap-3">
            <button ref={confirmRef} type="button" onClick={cancel} aria-disabled={busy || undefined} className={`${button} bg-danger text-accent-contrast`}>
              {busy ? labels.busy : labels.cancelYes}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={`${button} bg-surface ring-1 ring-border`}>
              {labels.cancelNo}
            </button>
          </div>
        </div>
      ) : null}

      {editing && canChange ? (
        <form onSubmit={save} noValidate className="flex flex-col gap-4 rounded-md bg-surface p-4 ring-1 ring-line">
          <CustomerFields
            idPrefix="order"
            values={values}
            errors={shown}
            labels={labels}
            onChange={(field, value) => setValues((v) => ({ ...v, [field]: value }))}
            onBlur={(field) => setTouched((t) => ({ ...t, [field]: true }))}
          />
          <div className="flex flex-wrap gap-3">
            <button type="submit" aria-disabled={busy || undefined} className={`${button} bg-petrol text-on-petrol`}>
              {busy ? labels.busy : labels.save}
            </button>
            <button type="button" onClick={() => setEditing(false)} className={`${button} bg-surface ring-1 ring-border`}>
              {labels.close}
            </button>
          </div>
        </form>
      ) : null}

      <p role="status" className={message?.tone === "warn" ? "text-warning" : "text-success"}>
        {message?.text ?? ""}
      </p>
    </div>
  );
}

/**
 * While the payment is not confirmed yet: refresh the page (which asks the
 * provider again) every few seconds, for at most two minutes — then the page
 * stays, with its honest message (docs/PAYMENTS.md § De terugkeerpagina).
 */
export function RefreshWhilePending() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const timer = window.setInterval(() => {
      n += 1;
      if (n > 24) return window.clearInterval(timer);
      router.refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}

/** Once the order is paid, the cart in this browser has done its work. */
export function ClearCartWhenPaid() {
  useEffect(() => {
    cartActions.clear();
  }, []);
  return null;
}
