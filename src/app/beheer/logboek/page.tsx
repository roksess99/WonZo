import Link from "next/link";
import { auditAction, auditActor, auditChange } from "@/components/admin/audit";
import { dateTime } from "@/components/admin/format";
import { requirePage } from "@/lib/admin/access";
import { listAudit } from "@/lib/admin/audit";
import { adminMessages } from "@/lib/admin/messages";
import { can } from "@/lib/admin/permissions";
import { getPool, hasDatabase } from "@/lib/db";
import { interpolate } from "@/lib/text";

export async function generateMetadata() {
  await requirePage("logboek");
  return { title: adminMessages().audit.title };
}

/**
 * The audit log: who did what, when, to which object (docs/BEHEER.md §
 * Beheerders: visible in the panel). Newest first, 50 a page; the page number
 * is the only thing in the URL. Read only — the log is append-only.
 */
export default async function AuditPage({ searchParams }: PageProps<"/beheer/logboek">) {
  const admin = await requirePage("logboek");
  const all = adminMessages();
  const m = all.audit;
  const sp = await searchParams;
  const requested = Math.max(1, Number.parseInt(String(sp.pagina ?? "1"), 10) || 1);
  // A failure says so; it does not look like an empty log (docs/BEHEER.md).
  const list = hasDatabase
    ? await listAudit(getPool(), requested).catch((err: unknown) => {
        console.error("[beheer/logboek]", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown"));
        return null;
      })
    : { rows: [], total: 0, pages: 1, page: 1 };
  const showOrders = can(admin.role, "bestellingen");
  const href = (page: number) => (page > 1 ? `/beheer/logboek?pagina=${page}` : "/beheer/logboek");

  return (
    <>
      <h1 className="font-display text-h1 font-bold">{m.title}</h1>
      <p className="max-w-prose text-muted">{m.intro}</p>
      {list === null ? (
        <p role="alert" className="font-medium text-danger">
          {all.dashboard.loadError}
        </p>
      ) : (
        <section aria-labelledby="log" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
          <h2 id="log" className="font-display text-h2">
            {list.total === 1 ? m.countOne : interpolate(m.count, { count: list.total })}
          </h2>
          {list.rows.length ? (
            <table className="w-full border-collapse text-start">
              <thead className="hidden text-body-sm text-muted sm:table-header-group">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pe-4 text-start font-medium">{m.colWhen}</th>
                  <th scope="col" className="py-2 pe-4 text-start font-medium">{m.colWho}</th>
                  <th scope="col" className="py-2 pe-4 text-start font-medium">{m.colWhat}</th>
                  <th scope="col" className="py-2 text-start font-medium">{m.colObject}</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => {
                  const change = auditChange(r.before, r.after);
                  return (
                    <tr key={r.id} className="flex flex-wrap gap-x-4 border-b border-line py-3 align-top sm:table-row sm:py-0">
                      <td className="py-0 tabular-nums text-muted sm:py-2 sm:pe-4">{dateTime(r.at)}</td>
                      <td className="py-0 sm:py-2 sm:pe-4">{r.actorName ?? auditActor(all, r.actor)}</td>
                      <td className="w-full py-0 sm:w-auto sm:py-2 sm:pe-4">
                        <span className="font-medium">{auditAction(all, r.action)}</span>
                        {r.reason ? <span className="block text-body-sm">{interpolate(m.reason, { reason: r.reason })}</span> : null}
                        {change ? <span className="block break-all text-body-sm text-muted">{change}</span> : null}
                      </td>
                      <td className="py-0 sm:py-2">
                        {r.objectType === "order" && r.orderReference ? (
                          showOrders ? (
                            <Link href={`/beheer/bestellingen/${r.objectId}`} className="underline-offset-4 hover:underline">
                              {r.orderReference}
                            </Link>
                          ) : (
                            r.orderReference
                          )
                        ) : (
                          `${(m.objects as Record<string, string>)[r.objectType] ?? r.objectType} ${r.objectId}`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-muted">{m.empty}</p>
          )}
          {list.pages > 1 ? (
            <nav aria-label={interpolate(m.page, { page: list.page, pages: list.pages })} className="flex items-center gap-4">
              {list.page > 1 ? (
                <Link href={href(list.page - 1)} className="underline underline-offset-4">
                  {m.previous}
                </Link>
              ) : null}
              <span className="text-body-sm text-muted">{interpolate(m.page, { page: list.page, pages: list.pages })}</span>
              {list.page < list.pages ? (
                <Link href={href(list.page + 1)} className="underline underline-offset-4">
                  {m.next}
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      )}
    </>
  );
}
