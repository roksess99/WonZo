import Link from "next/link";
import type { AdminMessages } from "@/lib/admin/messages";
import { formatMoney } from "@/lib/money";
import type { ReturnRow } from "@/lib/returns";
import { interpolate } from "@/lib/text";
import { shortDate } from "./format";
import { ReturnActions } from "./ReturnActions";

/** One return: what comes back, why, the maximum, and what the admin can do now (D-09). */
export function ReturnCard({ r, m, canAct, canRefund, showOrder }: { r: ReturnRow; m: AdminMessages; canAct: boolean; canRefund: boolean; showOrder: boolean }) {
  const rm = m.returns;
  return (
    <article aria-labelledby={`return-${r.id}`} className="flex flex-col gap-2 border-b border-line pb-4 last:border-b-0 last:pb-0">
      <h3 id={`return-${r.id}`} className="flex flex-wrap items-baseline gap-x-3 font-medium tabular-nums">
        <span className="font-bold">{r.number}</span>
        <span className="rounded-sm bg-background px-2 py-0.5 text-body-sm ring-1 ring-line">{rm.status[r.status]}</span>
        {showOrder ? (
          <Link href={`/beheer/bestellingen/${r.orderId}`} className="text-body underline-offset-4 hover:underline">
            {r.orderReference}
          </Link>
        ) : null}
      </h3>
      <p className="text-body-sm text-muted">
        {interpolate(rm.requestedOn, { date: shortDate(r.requestedAt) })}
        {r.receivedAt ? ` · ${interpolate(rm.receivedOn, { date: shortDate(r.receivedAt) })}` : ""}
      </p>
      <ul className="flex flex-col gap-1">
        {r.lines.map((l) => (
          <li key={l.lineNo}>
            {interpolate(rm.line, { quantity: l.quantity, name: l.name })}
            <span className="ms-2 text-body-sm text-muted">{interpolate(rm.lineReason, { reason: rm.reasons[l.reason] })}</span>
          </li>
        ))}
      </ul>
      <p className="tabular-nums">
        <span className="font-medium">{interpolate(rm.max, { amount: formatMoney(r.max) })}</span>
        <span className="block text-body-sm text-muted">{interpolate(rm.maxDetail, { lines: formatMoney(r.linesAmount), shipping: formatMoney(r.shipping) })}</span>
      </p>
      {r.customerNote ? <p className="max-w-prose text-body-sm">{interpolate(rm.note, { note: r.customerNote })}</p> : null}
      {r.refund ? <p className="tabular-nums">{interpolate(rm.refund, { amount: formatMoney(r.refund) })}</p> : null}
      {r.refundStatus ? <p className="text-body-sm text-muted">{interpolate(rm.refundStatus, { status: m.refundStatus[r.refundStatus as keyof typeof m.refundStatus] ?? r.refundStatus })}</p> : null}
      {r.deductionReason ? <p className="text-body-sm">{interpolate(rm.deduction, { reason: r.deductionReason })}</p> : null}
      {r.rejectReason ? <p className="text-body-sm">{interpolate(rm.rejected, { reason: r.rejectReason })}</p> : null}
      {(r.status === "REQUESTED" || r.status === "RECEIVED") && (canAct || canRefund) ? (
        <ReturnActions
          r={{ returnId: r.id, orderId: r.orderId, number: r.number, status: r.status }}
          max={r.max}
          canAct={canAct}
          canRefund={canRefund}
          m={rm}
          done={{ done: m.actions.done, doneSent: m.actions.doneSent, doneQueued: m.actions.doneQueued, reasonLabel: m.actions.reasonLabel, back: m.actions.back, busy: m.actions.busy }}
        />
      ) : null}
    </article>
  );
}
