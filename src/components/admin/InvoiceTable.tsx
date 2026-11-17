import Link from "next/link";
import type { AdminMessages } from "@/lib/admin/messages";
import type { InvoiceListRow } from "@/lib/invoices";
import { formatMoney } from "@/lib/money";
import { dateTime } from "./format";

/** Invoices and credit notes as a table; on a phone each row reads as a block (docs/BEHEER.md § Op een telefoon). */
export function InvoiceTable({ rows, m, showOrders, caption }: { rows: readonly InvoiceListRow[]; m: AdminMessages["invoices"]; showOrders: boolean; caption: string }) {
  return (
    <table className="w-full border-collapse text-start tabular-nums">
      <caption className="sr-only">{caption}</caption>
      <thead className="hidden text-body-sm text-muted sm:table-header-group">
        <tr className="border-b border-line">
          <th scope="col" className="py-2 pe-4 text-start font-medium">{m.colNumber}</th>
          <th scope="col" className="py-2 pe-4 text-start font-medium">{m.colOrder}</th>
          <th scope="col" className="py-2 pe-4 text-start font-medium">{m.colCustomer}</th>
          <th scope="col" className="py-2 pe-4 text-start font-medium">{m.colDate}</th>
          <th scope="col" className="py-2 text-end font-medium">{m.colTotal}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="flex flex-wrap gap-x-4 border-b border-line py-3 sm:table-row sm:py-0">
            <td className="py-0 font-medium sm:py-2 sm:pe-4">
              {/* A PDF from a route handler, not a page: a plain link. */}
              <a href={`/beheer/facturen/${r.id}/pdf`} className="underline decoration-2 underline-offset-4">
                {r.number}
              </a>
              {r.kind === "credit" ? <span className="ms-2 text-body-sm text-muted">{m.credit}</span> : null}
            </td>
            <td className="py-0 sm:py-2 sm:pe-4">
              {showOrders ? (
                <Link href={`/beheer/bestellingen/${r.orderId}`} className="underline-offset-4 hover:underline">
                  {r.reference}
                </Link>
              ) : (
                r.reference
              )}
            </td>
            <td className="w-full py-0 sm:w-auto sm:py-2 sm:pe-4">{r.customer}</td>
            <td className="py-0 text-muted sm:py-2 sm:pe-4">{dateTime(r.issuedAt)}</td>
            <td className="py-0 sm:py-2 sm:text-end">{formatMoney(r.totalIncl)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
