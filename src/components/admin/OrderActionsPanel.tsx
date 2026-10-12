"use client";

import { useActionState, useId, useState } from "react";
import { acceptPriceAction, cancelAndRefundAction, refundPaymentAction, releaseHoldAction, resendMailAction, retryPurchaseFormAction, type OrderActionState } from "@/app/beheer/bestellingen/actions";
import type { AdminMessages } from "@/lib/admin/messages";
import type { AdminOptions } from "@/lib/admin/order-actions";
import { formatMoney } from "@/lib/money";
import { interpolate } from "@/lib/text";

type Labels = AdminMessages["actions"];

function errorText(state: OrderActionState, m: Labels): string | null {
  if (state.ok !== false) return null;
  switch (state.error) {
    case "reason-required":
      return m.errorReason;
    case "changed":
      return m.errorChanged;
    case "not-allowed":
      return m.errorNotAllowed;
    case "amount-changed":
      return m.errorAmount;
    case "not-found":
      return m.errorNotFound;
    case "access":
      return m.errorAccess;
    case "at-supplier":
      return m.errorAtSupplier;
  }
}

function doneText(state: OrderActionState, m: Labels): string | null {
  if (state.ok !== true) return null;
  return state.refund === "sent" ? m.doneSent : state.refund === "queued" ? m.doneQueued : m.done;
}

/**
 * One action behind a confirmation that states what will happen, with the
 * exact amount (.claude/rules/beveiliging.md § Destructieve en financiële
 * handelingen). The amount comes from the server; the action computes it
 * again and refuses when it differs.
 */
function ConfirmAction({
  label,
  text,
  confirmLabel,
  action,
  fields,
  m,
  money: moves,
}: {
  label: string;
  text: string;
  confirmLabel: string;
  action: (state: OrderActionState, form: FormData) => Promise<OrderActionState>;
  fields: Record<string, string>;
  m: Labels;
  /** This one moves money: the confirm button looks like it. */
  money: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Controlled, so React's reset after a form action does not empty it (docs/BEHEER.md: a failed form keeps its values).
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState<OrderActionState, FormData>(action, { ok: null });
  const id = useId();
  const error = errorText(state, m);
  const done = doneText(state, m);
  if (done) {
    return (
      <p role="status" className="rounded-md bg-success-soft p-4 font-medium text-success">
        {done}
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 rounded-md bg-surface px-5 font-bold ring-1 ring-border hover:bg-background">
        {label}
      </button>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border-l-4 border-warning bg-warning-soft p-4">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <p className="font-medium">{text}</p>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-reason`} className="font-medium">
          {m.reasonLabel}
        </label>
        <textarea
          id={`${id}-reason`}
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={3}
          maxLength={200}
          rows={2}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          aria-invalid={state.ok === false && state.error === "reason-required" ? true : undefined}
          className="rounded-md border border-border bg-surface px-3 py-2 text-foreground"
        />
        <p id={`${id}-hint`} className="text-body-sm text-muted">
          {m.reasonHint}
        </p>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-body-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          aria-disabled={pending}
          onClick={(e) => pending && e.preventDefault()}
          className={`min-h-11 rounded-md px-5 font-bold ${moves ? "bg-danger text-on-petrol" : "bg-accent text-accent-contrast"} hover:brightness-95`}
        >
          {pending ? m.busy : confirmLabel}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-md px-5 font-medium underline underline-offset-4">
          {m.back}
        </button>
      </div>
    </form>
  );
}

export function OrderActionsPanel({
  orderId,
  holdReason,
  options,
  canManage,
  canRefund,
  mailKinds,
  m,
}: {
  orderId: number;
  holdReason: string | null;
  options: AdminOptions;
  canManage: boolean;
  canRefund: boolean;
  mailKinds: Record<string, string>;
  m: Labels;
}) {
  const base = { orderId: String(orderId) };
  const cancel = options.cancel;
  return (
    <div className="flex flex-col gap-3">
      {options.heldUnpaid ? <p className="max-w-prose">{m.heldUnpaid}</p> : null}
      {options.paidLate ? <p className="max-w-prose">{m.paidLate}</p> : null}
      <div className="flex flex-col items-start gap-3">
        {canManage && options.releaseHold && holdReason ? (
          <ConfirmAction label={m.release} text={m.releaseText} confirmLabel={m.releaseConfirm} action={releaseHoldAction} fields={{ ...base, expectedHold: holdReason }} m={m} money={false} />
        ) : null}
        {canManage && options.acceptPrice ? (
          <ConfirmAction
            label={interpolate(m.acceptPrice, { checked: formatMoney(options.acceptPrice.checked) })}
            text={interpolate(m.acceptPriceText, { checked: formatMoney(options.acceptPrice.checked), expected: formatMoney(options.acceptPrice.expected) })}
            confirmLabel={interpolate(m.acceptPriceConfirm, { checked: formatMoney(options.acceptPrice.checked) })}
            action={acceptPriceAction}
            fields={{ ...base, supplierOrderId: options.acceptPrice.supplierOrderId, expectedCheckedCents: String(options.acceptPrice.checked.amount) }}
            m={m}
            money
          />
        ) : null}
        {canManage && options.retryPurchase ? (
          <ConfirmAction
            label={m.retryPurchase}
            text={m.retryPurchaseText}
            confirmLabel={m.retryPurchaseConfirm}
            action={retryPurchaseFormAction}
            fields={{ ...base, supplierOrderId: options.retryPurchase.supplierOrderId }}
            m={m}
            money={false}
          />
        ) : null}
        {canManage
          ? options.resendMails.map((x) => (
              <ConfirmAction
                key={x.outboxId}
                label={`${m.resendMail} (${mailKinds[x.kind] ?? x.kind})`}
                text={m.resendMailText}
                confirmLabel={m.resendMailConfirm}
                action={resendMailAction}
                fields={{ ...base, outboxId: String(x.outboxId) }}
                m={m}
                money={false}
              />
            ))
          : null}
        {canRefund && cancel ? (
          <ConfirmAction
            label={cancel.refund.amount > 0 ? m.cancel : m.cancelNoRefund}
            text={cancel.refund.amount > 0 ? interpolate(m.cancelText, { amount: formatMoney(cancel.refund) }) : m.cancelTextNoRefund}
            confirmLabel={cancel.refund.amount > 0 ? interpolate(m.cancelConfirm, { amount: formatMoney(cancel.refund) }) : m.cancelConfirmNoRefund}
            action={cancelAndRefundAction}
            fields={{ ...base, expectedRefundCents: String(cancel.refund.amount) }}
            m={m}
            money={cancel.refund.amount > 0}
          />
        ) : null}
        {canRefund
          ? options.refundPayments.map((p) => (
              <ConfirmAction
                key={p.paymentId}
                label={`${m.refundPayment} (${formatMoney(p.open)})`}
                text={interpolate(m.refundPaymentText, { amount: formatMoney(p.open) })}
                confirmLabel={interpolate(m.refundPaymentConfirm, { amount: formatMoney(p.open) })}
                action={refundPaymentAction}
                fields={{ ...base, paymentId: p.paymentId, expectedRefundCents: String(p.open.amount) }}
                m={m}
                money
              />
            ))
          : null}
      </div>
    </div>
  );
}
