import Link from "next/link";
import type { AdminMessages } from "@/lib/admin/messages";
import type { OrderListRow } from "@/lib/admin/orders";
import { formatMoney } from "@/lib/money";
import { shortDate } from "./format";

/** Orders as a table on a wide screen; on a phone each row reads as a block (docs/BEHEER.md § Op een telefoon). */
export function OrderTable({ rows, m, caption }: { rows: OrderListRow[]; m: AdminMessages; caption: string }) {
  return (
    <table className="w-full border-collapse text-start tabular-nums">
      <caption className="sr-only">{caption}</caption>
      <thead className="hidden text-body-sm text-muted sm:table-header-group">
        <tr className="border-b border-line">
          <th scope="col" className="py-2 pe-4 text-start font-medium">{m.orders.colReference}</th>
          <th scope="col" className="py-2 pe-4 text-start font-medium">{m.orders.colDate}</th>
          <th scope="col" className="py-2 pe-4 text-start font-medium">{m.orders.colCustomer}</th>
          <th scope="col" className="py-2 pe-4 text-end font-medium">{m.orders.colTotal}</th>
          <th scope="col" className="py-2 pe-4 text-start font-medium">{m.orders.colStatus}</th>
          <th scope="col" className="py-2 text-start font-medium">{m.orders.colPurchase}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="flex flex-wrap gap-x-4 border-b border-line py-3 sm:table-row sm:py-0">
            <td className="py-0 font-medium sm:py-2 sm:pe-4">
              <Link href={`/beheer/bestellingen/${r.id}`} className="underline decoration-2 underline-offset-4">
                {r.reference}
              </Link>
            </td>
            <td className="py-0 text-muted sm:py-2 sm:pe-4">{shortDate(r.createdAt)}</td>
            <td className="w-full py-0 sm:w-auto sm:py-2 sm:pe-4">{r.customer}</td>
            <td className="py-0 sm:py-2 sm:pe-4 sm:text-end">{formatMoney(r.total)}</td>
            <td className="py-0 sm:py-2 sm:pe-4">
              {m.status[r.status]}
              {r.holdReason ? <span className="ms-2 rounded-sm bg-danger-soft px-2 py-0.5 text-body-sm font-medium text-danger">{m.orders.onHold}</span> : null}
            </td>
            <td className="w-full py-0 text-body-sm text-muted sm:w-auto sm:py-2 sm:text-body">
              {/* On a phone with a label: a bare status word would be read as the order's. */}
              <span className="sm:hidden">{m.orders.colPurchase}: </span>
              {r.purchase ? m.purchaseStatus[r.purchase] : m.orders.purchaseNone}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
