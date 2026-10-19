import Link from "next/link";
import { requirePage } from "@/lib/admin/access";
import { adminMessages } from "@/lib/admin/messages";
import { getPool, hasDatabase } from "@/lib/db";
import { FunnelList } from "@/components/admin/FunnelList";
import { readFunnel, readStats } from "@/lib/stats";
import { interpolate } from "@/lib/text";

export async function generateMetadata() {
  await requirePage("statistieken");
  return { title: adminMessages().stats.title };
}

const PERIODS = [7, 30, 90] as const;
const dayName = (day: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

/**
 * The shop's own statistics (D-10, owner 2026-10-15): page views per day and
 * per page, nothing about visitors. A table, not a chart: the numbers are
 * what the owner reads (docs/BEHEER.md § Wat er bewust niet in hoort).
 */
export default async function StatsPage({ searchParams }: PageProps<"/beheer/statistieken">) {
  await requirePage("statistieken");
  const m = adminMessages().stats;
  const sp = await searchParams;
  const days = PERIODS.find((p) => String(p) === sp.dagen) ?? 30;
  const failed = (err: unknown) => {
    console.error("[beheer/statistieken]", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown"));
    return null;
  };
  const [stats, funnel] = hasDatabase
    ? await Promise.all([readStats(getPool(), days).catch(failed), readFunnel(getPool(), days).catch(failed)])
    : [{ days: [], pages: [], total: 0 }, { cart: 0, checkout: 0, started: 0, paid: 0 }];
  const nf = new Intl.NumberFormat("nl-NL");
  const label = (path: string) => (path.endsWith("…") ? `${path} — ${m.statusPages}` : path);

  return (
    <>
      <h1 className="font-display text-h1 font-bold">{m.title}</h1>
      <p className="max-w-prose text-muted">{m.intro}</p>
      <nav aria-label={m.periods} className="flex gap-6">
        {PERIODS.map((p) => (
          <Link key={p} href={`/beheer/statistieken?dagen=${p}`} aria-current={p === days ? "page" : undefined} className={p === days ? "font-bold underline" : "underline-offset-4 hover:underline"}>
            {interpolate(m.period, { days: p })}
          </Link>
        ))}
      </nav>
      {stats === null ? (
        <p role="alert" className="font-medium text-danger">
          {adminMessages().dashboard.loadError}
        </p>
      ) : (
        <>
          <p className="text-h2 font-display tabular-nums">{interpolate(m.total, { count: nf.format(stats.total), days })}</p>
          {funnel ? (
            <section aria-labelledby="funnel" className="flex max-w-xl flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
              <h2 id="funnel" className="font-display text-h2">
                {m.funnelTitle}
              </h2>
              <FunnelList f={funnel} days={days} m={m} />
            </section>
          ) : null}
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <section aria-labelledby="pages" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
              <h2 id="pages" className="font-display text-h2">
                {m.pagesTitle}
              </h2>
              {stats.pages.length ? (
                <table className="w-full border-collapse text-start tabular-nums">
                  <thead className="text-body-sm text-muted">
                    <tr className="border-b border-line">
                      <th scope="col" className="py-2 pe-4 text-start font-medium">{m.colPage}</th>
                      <th scope="col" className="py-2 text-end font-medium">{m.colViews}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.pages.map((p) => (
                      <tr key={p.path} className="border-b border-line">
                        <td className="break-all py-2 pe-4">{label(p.path)}</td>
                        <td className="py-2 text-end">{nf.format(p.views)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-muted">{m.empty}</p>
              )}
            </section>
            <section aria-labelledby="per-day" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
              <h2 id="per-day" className="font-display text-h2">
                {m.perDayTitle}
              </h2>
              <table className="w-full border-collapse text-start tabular-nums">
                <thead className="text-body-sm text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 pe-4 text-start font-medium">{m.colDay}</th>
                    <th scope="col" className="py-2 text-end font-medium">{m.colViews}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...stats.days].reverse().map((d) => (
                    <tr key={d.day} className="border-b border-line">
                      <td className="py-2 pe-4">{dayName(d.day)}</td>
                      <td className="py-2 text-end">{nf.format(d.views)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </>
  );
}
