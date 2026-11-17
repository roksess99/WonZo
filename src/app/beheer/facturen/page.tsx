import Link from "next/link";
import { dateTime, vatRate } from "@/components/admin/format";
import { requirePage } from "@/lib/admin/access";
import { adminMessages } from "@/lib/admin/messages";
import { can } from "@/lib/admin/permissions";
import { amsterdamYearMonth } from "@/lib/dates";
import { getPool, hasDatabase } from "@/lib/db";
import { listInvoices, vatOverview } from "@/lib/invoices";
import { formatMoney, money } from "@/lib/money";
import { interpolate } from "@/lib/text";

export async function generateMetadata() {
  await requirePage("facturen");
  return { title: adminMessages().invoices.title };
}

const monthName = (month: number) => new Intl.DateTimeFormat("nl-NL", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, month - 1, 15)));

/**
 * The invoices per month, and the VAT per month and rate for the return
 * (docs/BEHEER.md § Facturen, docs/FACTUUR.md § Het btw-overzicht). Year and
 * month in the URL; an unknown one falls back to this month instead of
 * complaining.
 */
export default async function InvoicesPage({ searchParams }: PageProps<"/beheer/facturen">) {
  const admin = await requirePage("facturen");
  const m = adminMessages().invoices;
  const sp = await searchParams;
  const now = amsterdamYearMonth(new Date());
  const yearParam = Number(sp.jaar);
  const monthParam = Number(sp.maand);
  const year = Number.isInteger(yearParam) && yearParam >= 2026 && yearParam <= now.year ? yearParam : now.year;
  const month = Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : now.month;
  // A failure says so, it does not look like a month without invoices (docs/BEHEER.md: a caught error looks like an empty state).
  const loaded = hasDatabase
    ? await Promise.all([listInvoices(getPool(), year, month), vatOverview(getPool(), year)]).catch((err: unknown) => {
        console.error("[beheer/facturen]", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown"));
        return null;
      })
    : ([[], []] as const);
  const [rows, overview] = loaded ?? [[], []];
  const showOrders = can(admin.role, "bestellingen");

  return (
    <>
      <h1 className="font-display text-h1 font-bold">{m.title}</h1>
      <p className="flex flex-wrap gap-x-6 gap-y-1">
        {/* A PDF from a route handler, not a page: a plain link, not next/link (the rule cannot tell). */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/beheer/facturen/voorbeeld" className="underline decoration-2 underline-offset-4">
          {m.example}
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/beheer/facturen/voorbeeld?soort=credit" className="underline decoration-2 underline-offset-4">
          {m.exampleCredit}
        </a>
      </p>

      {loaded ? null : (
        <p role="alert" className="font-medium text-danger">
          {adminMessages().dashboard.loadError}
        </p>
      )}
      <section aria-labelledby="vat" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
        <h2 id="vat" className="font-display text-h2">
          {interpolate(m.vatTitle, { year })}
        </h2>
        <p className="text-body-sm text-muted">{m.vatText}</p>
        <table className="w-full border-collapse text-start tabular-nums">
          <thead className="text-body-sm text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pe-4 text-start font-medium">{m.colMonth}</th>
              <th scope="col" className="py-2 pe-4 text-end font-medium">{m.colDocuments}</th>
              <th scope="col" className="py-2 pe-4 text-end font-medium">{m.colBase}</th>
              <th scope="col" className="py-2 text-end font-medium">{m.colVat}</th>
            </tr>
          </thead>
          <tbody>
            {overview
              .filter((o) => o.documents > 0 || o.month === month)
              .map((o) => (
                <tr key={o.month} className="border-b border-line align-top">
                  <th scope="row" className="py-2 pe-4 text-start font-normal">
                    <Link href={`/beheer/facturen?jaar=${year}&maand=${o.month}`} aria-current={o.month === month ? "page" : undefined} className={o.month === month ? "font-bold underline" : "underline-offset-4 hover:underline"}>
                      {monthName(o.month)}
                    </Link>
                  </th>
                  <td className="py-2 pe-4 text-end">{o.documents}</td>
                  <td className="py-2 pe-4 text-end">
                    {o.byRate.length ? o.byRate.map((r) => <span key={r.vatRateBp} className="block">{`${formatMoney(r.base)} (${vatRate(r.vatRateBp)})`}</span>) : formatMoney(money(0))}
                  </td>
                  <td className="py-2 text-end">{o.byRate.length ? o.byRate.map((r) => <span key={r.vatRateBp} className="block">{formatMoney(r.vat)}</span>) : formatMoney(money(0))}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="list" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
        <h2 id="list" className="font-display text-h2">
          {interpolate(m.listTitle, { month: monthName(month), year })}
        </h2>
        {rows.length ? (
          <table className="w-full border-collapse text-start tabular-nums">
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
        ) : (
          <p className="text-muted">{m.empty}</p>
        )}
      </section>
    </>
  );
}
