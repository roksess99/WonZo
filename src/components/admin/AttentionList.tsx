import Link from "next/link";
import type { AdminMessages } from "@/lib/admin/messages";
import type { AttentionItem } from "@/lib/admin/orders";
import { formatMoney } from "@/lib/money";
import { increasePercent } from "@/lib/orders/supplier-states";
import { shortDate } from "./format";
import { interpolate } from "@/lib/text";

export function holdText(m: AdminMessages, reason: string): { what: string; todo?: string } {
  const known = m.holds as Record<string, string>;
  return { what: known[reason] ?? interpolate(m.holds.unknown, { reason }), todo: known[`${reason}Action`] };
}

function describe(item: AttentionItem, m: AdminMessages): { title: string; todo?: string } {
  switch (item.kind) {
    case "hold": {
      const h = holdText(m, item.holdReason);
      return { title: interpolate(m.attention.hold, { reference: item.reference, reason: h.what }), todo: h.todo };
    }
    case "paid-not-accepted":
      return { title: interpolate(m.attention.paidNotAccepted, { reference: item.reference, amount: formatMoney(item.open), status: m.status[item.status].toLowerCase() }), todo: m.attention.paidNotAcceptedAction };
    case "paid-late":
      return {
        title: interpolate(m.attention.paidLate, { reference: item.reference, amount: formatMoney(item.amount), recorded: m.paymentStatus[item.recordedAs].toLowerCase(), status: m.status[item.status].toLowerCase() }),
        todo: m.attention.paidLateAction,
      };
    case "refund-failed":
      return { title: interpolate(m.attention.refundFailed, { reference: item.reference, amount: formatMoney(item.amount) }), todo: m.attention.refundFailedAction };
    case "purchase-blocked":
      return {
        title: interpolate(m.attention.purchaseBlocked, { reference: item.reference, checked: formatMoney(item.checked), expected: formatMoney(item.expected), percent: increasePercent(item.expected.amount, item.checked.amount) }),
        todo: m.attention.purchaseBlockedAction,
      };
    case "purchase-failing":
      return { title: interpolate(m.attention.purchaseFailing, { reference: item.reference, error: item.error }), todo: interpolate(m.attention.purchaseFailingAction, { until: shortDate(item.until) }) };
    case "purchase-gave-up":
      return { title: interpolate(m.attention.purchaseGaveUp, { reference: item.reference, error: item.error }), todo: m.attention.purchaseGaveUpAction };
    case "purchase-unknown":
      return { title: interpolate(m.attention.purchaseUnknown, { reference: item.reference }), todo: m.attention.purchaseUnknownAction };
    case "mail-failed":
      return {
        title: interpolate(m.attention.mailFailed, { reference: item.reference, kind: (m.attention.mailKinds as Record<string, string>)[item.mailKind] ?? item.mailKind, error: item.error }),
        todo: m.attention.mailFailedAction,
      };
    case "refund-unknown":
      return { title: interpolate(m.attention.refundUnknown, { reference: item.reference, amount: formatMoney(item.amount) }), todo: m.attention.refundUnknownAction };
  }
}

/** Every line says what is wrong and what to do (docs/BEHEER.md § Dashboard). Empty in a healthy shop. */
export function AttentionList({ items, m }: { items: AttentionItem[]; m: AdminMessages }) {
  if (!items.length) return <p className="text-muted">{m.dashboard.attentionEmpty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {items.map((item, i) => {
        const d = describe(item, m);
        return (
          <li key={`${item.kind}-${item.orderId}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
            <div className="flex flex-col gap-1">
              <p className="font-medium">{d.title}</p>
              {d.todo ? <p className="text-body-sm text-muted">{d.todo}</p> : null}
            </div>
            <Link href={`/beheer/bestellingen/${item.orderId}`} className="font-medium underline decoration-2 underline-offset-4">
              {m.attention.open}
              <span className="sr-only"> {item.reference}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
