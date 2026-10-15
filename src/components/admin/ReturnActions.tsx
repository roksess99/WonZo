"use client";

import { useActionState, useId, useState } from "react";
import { receiveReturnAction, refundReturnAction, rejectReturnAction, type ReturnActionState } from "@/app/beheer/retouren/actions";
import type { AdminMessages } from "@/lib/admin/messages";
import { formatMoney, money, type Money } from "@/lib/money";
import { parseEuroInput } from "@/lib/returns/amount";
import { interpolate } from "@/lib/text";

type Labels = AdminMessages["returns"];
type Common = { returnId: number; orderId: number; number: string; status: string };

function errorText(state: ReturnActionState, m: Labels, max: Money): string | null {
  if (state.ok !== false) return null;
  switch (state.error) {
    case "reason-required":
      return m.errorDeduction;
    case "amount-format":
      return m.errorAmountFormat;
    case "amount-range":
      return interpolate(m.errorRange, { max: formatMoney(max) });
    case "amount-changed":
      return m.errorAmountChanged;
    case "changed":
      return m.errorChanged;
    case "not-allowed":
      return m.errorNotAllowed;
    case "not-found":
      return m.errorNotFound;
    case "access":
      return m.errorAccess;
  }
}

const doneText = (state: ReturnActionState, done: { done: string; doneSent: string; doneQueued: string }) =>
  state.ok !== true ? null : state.refund === "sent" ? done.doneSent : state.refund === "queued" ? done.doneQueued : done.done;

const button = "min-h-11 rounded-md px-5 font-bold";

/**
 * Received → approve (all or part back, with a reason when less) or refuse
 * (with a reason the customer will read). Each step behind a confirmation
 * that states the exact amount (.claude/rules/beveiliging.md § Destructieve
 * en financiële handelingen); the server computes the maximum itself and
 * refuses anything above it.
 */
export function ReturnActions({ r, max, canAct, canRefund, m, done }: { r: Common; max: Money; canAct: boolean; canRefund: boolean; m: Labels; done: { done: string; doneSent: string; doneQueued: string; reasonLabel: string; back: string; busy: string } }) {
  const [open, setOpen] = useState<"receive" | "approve" | "reject" | null>(null);
  // Controlled, so React's reset after a form action does not empty them (docs/BEHEER.md: a failed form keeps its values).
  const [amount, setAmount] = useState(formatMoney(max).replace(/[^\d,]/g, ""));
  const [deduction, setDeduction] = useState("");
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  const [formatError, setFormatError] = useState(false);
  const [receiveState, receive, receiving] = useActionState<ReturnActionState, FormData>(receiveReturnAction, { ok: null });
  const [refundState, refund, refunding] = useActionState<ReturnActionState, FormData>(refundReturnAction, { ok: null });
  const [rejectState, reject, rejecting] = useActionState<ReturnActionState, FormData>(rejectReturnAction, { ok: null });
  const id = useId();
  const hidden = (
    <>
      <input type="hidden" name="returnId" value={r.returnId} />
      <input type="hidden" name="orderId" value={r.orderId} />
      <input type="hidden" name="expectedStatus" value={r.status} />
    </>
  );
  const finished = doneText(receiveState, done) ?? doneText(refundState, done) ?? doneText(rejectState, done);
  if (finished) {
    return (
      <p role="status" className="rounded-md bg-success-soft p-4 font-medium text-success">
        {finished}
      </p>
    );
  }
  const cents = parseEuroInput(amount);
  const lower = cents !== null && cents < max.amount;
  const shown = cents === null ? null : money(cents);

  return (
    <div className="flex flex-col items-start gap-3">
      {open === null ? (
        <div className="flex flex-wrap gap-3">
          {canAct && r.status === "REQUESTED" ? (
            <button type="button" onClick={() => setOpen("receive")} className={`${button} bg-surface ring-1 ring-border hover:bg-background`}>
              {m.receive}
            </button>
          ) : null}
          {canRefund && r.status === "RECEIVED" ? (
            <button type="button" onClick={() => setOpen("approve")} className={`${button} bg-surface ring-1 ring-border hover:bg-background`}>
              {m.approve}
            </button>
          ) : null}
          {canAct && (r.status === "REQUESTED" || r.status === "RECEIVED") ? (
            <button type="button" onClick={() => setOpen("reject")} className={`${button} bg-surface text-danger ring-1 ring-border hover:bg-background`}>
              {m.reject}
            </button>
          ) : null}
        </div>
      ) : null}

      {open === "receive" ? (
        <form action={receive} className="flex flex-col gap-3 rounded-md border-l-4 border-warning bg-warning-soft p-4">
          {hidden}
          <p className="font-medium">{interpolate(m.receiveText, { number: r.number })}</p>
          <Error text={errorText(receiveState, m, max)} id={`${id}-recv-error`} />
          <div className="flex flex-wrap gap-3">
            <button type="submit" aria-disabled={receiving} onClick={(e) => receiving && e.preventDefault()} className={`${button} bg-accent text-accent-contrast hover:brightness-95`}>
              {receiving ? done.busy : m.receiveConfirm}
            </button>
            <button type="button" onClick={() => setOpen(null)} className="min-h-11 rounded-md px-5 font-medium underline underline-offset-4">
              {done.back}
            </button>
          </div>
        </form>
      ) : null}

      {open === "approve" ? (
        <form action={refund} className="flex w-full max-w-xl flex-col gap-3 rounded-md border-l-4 border-warning bg-warning-soft p-4">
          {hidden}
          <input type="hidden" name="expectedMaxCents" value={max.amount} />
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-amount`} className="font-medium">
              {m.amountLabel}
            </label>
            <input
              id={`${id}-amount`}
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setChecked(false);
                setFormatError(false);
              }}
              aria-invalid={formatError || undefined}
              aria-describedby={`${id}-amount-hint${formatError ? ` ${id}-format-error` : ""}`}
              className="w-40 rounded-md border border-border bg-surface px-3 py-2 tabular-nums text-foreground"
            />
            <p id={`${id}-amount-hint`} className="text-body-sm text-muted">
              {interpolate(m.amountHint, { max: formatMoney(max) })}
            </p>
          </div>
          {lower ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-deduction`} className="font-medium">
                {m.deductionLabel}
              </label>
              <textarea
                id={`${id}-deduction`}
                name="deduction"
                value={deduction}
                onChange={(e) => setDeduction(e.target.value)}
                rows={2}
                maxLength={200}
                aria-describedby={`${id}-deduction-hint`}
                className="rounded-md border border-border bg-surface px-3 py-2 text-foreground"
              />
              <p id={`${id}-deduction-hint`} className="text-body-sm text-muted">
                {m.deductionHint}
              </p>
            </div>
          ) : null}
          <Error text={formatError ? m.errorAmountFormat : null} id={`${id}-format-error`} />
          <Error text={errorText(refundState, m, max)} id={`${id}-refund-error`} />
          {checked && shown ? <p className="font-medium">{interpolate(m.approveText, { amount: formatMoney(shown), number: r.number })}</p> : null}
          <div className="flex flex-wrap gap-3">
            {checked && shown ? (
              <button type="submit" aria-disabled={refunding} onClick={(e) => refunding && e.preventDefault()} className={`${button} bg-danger text-on-petrol hover:brightness-95`}>
                {refunding ? done.busy : interpolate(m.approveConfirm, { amount: formatMoney(shown) })}
              </button>
            ) : (
              // First the exact amount in words, then the button that moves money.
              <button type="button" onClick={() => (shown ? setChecked(true) : setFormatError(true))} className={`${button} bg-accent text-accent-contrast hover:brightness-95`}>
                {m.approveCheck}
              </button>
            )}
            <button type="button" onClick={() => setOpen(null)} className="min-h-11 rounded-md px-5 font-medium underline underline-offset-4">
              {done.back}
            </button>
          </div>
        </form>
      ) : null}

      {open === "reject" ? (
        <form action={reject} className="flex w-full max-w-xl flex-col gap-3 rounded-md border-l-4 border-warning bg-warning-soft p-4">
          {hidden}
          <p className="font-medium">{interpolate(m.rejectText, { number: r.number })}</p>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-reason`} className="font-medium">
              {done.reasonLabel}
            </label>
            <textarea
              id={`${id}-reason`}
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={200}
              rows={3}
              className="rounded-md border border-border bg-surface px-3 py-2 text-foreground"
            />
          </div>
          <Error text={errorText(rejectState, m, max)} id={`${id}-reject-error`} />
          <div className="flex flex-wrap gap-3">
            <button type="submit" aria-disabled={rejecting} onClick={(e) => rejecting && e.preventDefault()} className={`${button} bg-danger text-on-petrol hover:brightness-95`}>
              {rejecting ? done.busy : m.rejectConfirm}
            </button>
            <button type="button" onClick={() => setOpen(null)} className="min-h-11 rounded-md px-5 font-medium underline underline-offset-4">
              {done.back}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Error({ text, id }: { text: string | null; id: string }) {
  return text ? (
    <p id={id} role="alert" className="text-body-sm font-medium text-danger">
      {text}
    </p>
  ) : null;
}
