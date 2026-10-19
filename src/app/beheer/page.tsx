import Link from "next/link";
import { AttentionList } from "@/components/admin/AttentionList";
import { time } from "@/components/admin/format";
import { HealthAlerts, type OrderingStatus } from "@/components/admin/HealthAlerts";
import { OrderTable } from "@/components/admin/OrderTable";
import { requirePage } from "@/lib/admin/access";
import { adminMessages } from "@/lib/admin/messages";
import { attentionItems, latestOrders, orderSummary, ORDER_GROUPS, waitingPurchases, type OrderGroup } from "@/lib/admin/orders";
import { orderingMode } from "@/lib/catalog/ordering";
import { can, PERMISSIONS, type Permission } from "@/lib/admin/permissions";
import { supplierBalance, supplierHealth } from "@/lib/catalog/supplier-status";
import { getPool, hasDatabase } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { mailHealth } from "@/lib/mail";
import { paymentHealth } from "@/lib/payments/health";
import { openReturnsSummary } from "@/lib/returns";
import { invoiceTotals } from "@/lib/invoices";
import { readFunnel, readStats } from "@/lib/stats";
import { lowReviewsWithoutReply } from "@/lib/reviews";
import { FunnelList } from "@/components/admin/FunnelList";

const monthName = (month: number) => new Intl.DateTimeFormat("nl-NL", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, month - 1, 15)));
import { interpolate } from "@/lib/text";

// Behind the same check as the page: to a stranger even the title says nothing.
export async function generateMetadata() {
  await requirePage(null);
  const m = adminMessages();
  // The layout's title template only reaches child segments; this page is the layout's own segment.
  return { title: { absolute: m.meta.titleTemplate.replace("%s", m.dashboard.title) } };
}

/** Lets a block fall back, and says why in the server log (the error's code, never data). */
const logged =
  <T,>(block: string, fallback: T) =>
  (err: unknown): T => {
    const code = (err as { code?: unknown }).code;
    console.error(`[beheer] ${block}:`, typeof code === "string" ? code : err instanceof Error ? err.name : "unknown");
    return fallback;
  };

function orderingModeOrBad(): OrderingStatus["mode"] {
  try {
    return orderingMode(process.env);
  } catch {
    return "bad-config";
  }
}

/** A block whose source failed says so: a caught error must not look like an empty state (docs/BEHEER.md). */
function LoadError({ text }: { text: string }) {
  return (
    <p role="alert" className="text-body-sm font-medium text-danger">
      {text}
    </p>
  );
}

const isPermission = (x: unknown): x is Permission => typeof x === "string" && (PERMISSIONS as readonly string[]).includes(x);

/**
 * The first screen: what needs doing now (docs/BEHEER.md § Dashboard).
 * Every block is fetched only for whoever may see it — not fetched is
 * something else than hidden (.claude/rules/beveiliging.md).
 */
export default async function Dashboard({ searchParams }: PageProps<"/beheer">) {
  const admin = await requirePage(null);
  const m = adminMessages();
  const { "geen-toegang": denied } = await searchParams;
  const now = new Date();
  const orders = can(admin.role, "bestellingen") && hasDatabase;
  const invoices = can(admin.role, "facturen") && hasDatabase;
  const visits = can(admin.role, "statistieken") && hasDatabase;
  const reviews = can(admin.role, "beoordelingen") && hasDatabase;

  // Independent of each other: in parallel. A block whose source fails is left out, the rest stays.
  const [payment, supplier, balance, summary, attention, latest, waiting, mail, returns, totals, week, funnel, lowReviews] = await Promise.all([
    paymentHealth(now),
    supplierHealth(now),
    orders ? supplierBalance(now).catch(logged("balance", null)) : null,
    orders ? orderSummary(getPool(), now).catch(logged("summary", null)) : null,
    orders ? attentionItems(getPool(), now).catch(logged("attention", null)) : null,
    orders ? latestOrders(getPool()).catch(logged("latest", null)) : null,
    hasDatabase ? waitingPurchases(getPool()).catch(logged("waiting", 0)) : 0,
    mailHealth(now),
    // Only a count and a date: for every role, like the other warnings.
    hasDatabase ? openReturnsSummary(getPool()).catch(logged("returns", null)) : null,
    invoices ? invoiceTotals(getPool(), now).catch(logged("invoices", null)) : null,
    visits ? readStats(getPool(), 7, now, 5).catch(logged("visits", null)) : null,
    visits ? readFunnel(getPool(), 30, now).catch(logged("funnel", null)) : null,
    reviews ? lowReviewsWithoutReply(getPool()).catch(logged("reviews", null)) : null,
  ]);
  const ordering: OrderingStatus = { mode: orderingModeOrBad(), waiting };

  return (
    <>
      <h1 className="font-display text-h1 font-bold">{m.dashboard.title}</h1>
      {isPermission(denied) ? (
        <div role="status" className="rounded-md border-l-4 border-warning bg-warning-soft p-4">
          <p className="font-bold">{m.noAccess.title}</p>
          <p className="text-body-sm">{interpolate(m.noAccess.text, { permission: m.permissions[denied] })}</p>
        </div>
      ) : null}
      <HealthAlerts payment={payment} supplier={supplier} ordering={ordering} mail={mail} returns={returns} now={now} m={m.health} />

      {orders ? (
        <>
          <section aria-labelledby="attention" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
            <h2 id="attention" className="font-display text-h2">
              {m.dashboard.attentionTitle}
            </h2>
            {attention ? <AttentionList items={attention} m={m} /> : <LoadError text={m.dashboard.loadError} />}
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            <section aria-labelledby="orders-tile" className="flex flex-col gap-2 rounded-md bg-surface p-6 ring-1 ring-line">
              <h2 id="orders-tile" className="font-display text-h2">
                {m.dashboard.ordersTitle}
              </h2>
              {summary ? (
                <ul className="flex flex-col gap-1 tabular-nums">
                  {(Object.keys(ORDER_GROUPS) as OrderGroup[]).map((g) => (
                    <li key={g}>
                      <Link href={`/beheer/bestellingen?lijst=${g}`} className="underline-offset-4 hover:underline">
                        {interpolate(m.dashboard.groupCount, { count: summary.counts[g], group: m.groups[g] })}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <LoadError text={m.dashboard.loadError} />
              )}
            </section>
            <section aria-labelledby="month-tile" className="flex flex-col gap-2 rounded-md bg-surface p-6 ring-1 ring-line">
              <h2 id="month-tile" className="font-display text-h2">
                {m.dashboard.monthTitle}
              </h2>
              {summary ? (
                <>
                  <p className="text-h1 font-bold tabular-nums">{formatMoney(summary.paidThisMonth.total)}</p>
                  <p className="text-body-sm text-muted">
                    {summary.paidThisMonth.count === 1 ? m.dashboard.monthTextOne : interpolate(m.dashboard.monthText, { count: summary.paidThisMonth.count })}
                  </p>
                </>
              ) : (
                <LoadError text={m.dashboard.loadError} />
              )}
            </section>
            <section aria-labelledby="balance-tile" className="flex flex-col gap-2 rounded-md bg-surface p-6 ring-1 ring-line">
              <h2 id="balance-tile" className="font-display text-h2">
                {m.dashboard.balanceTitle}
              </h2>
              {supplier.state === "no-key" ? (
                <p className="text-muted">{m.dashboard.balanceNoKey}</p>
              ) : balance ? (
                <>
                  <p className="text-h1 font-bold tabular-nums">{formatMoney(balance.balance)}</p>
                  <p className="text-body-sm text-muted">{interpolate(m.dashboard.balanceMeasured, { time: time(balance.measuredAt) })}</p>
                  {balance.balance.amount === 0 ? <p className="text-body-sm font-medium text-danger">{m.dashboard.balanceEmpty}</p> : null}
                </>
              ) : (
                <p className="text-body-sm text-muted">{m.dashboard.balanceNone}</p>
              )}
            </section>
          </div>

          <section aria-labelledby="latest" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
            <h2 id="latest" className="font-display text-h2">
              {m.dashboard.latestTitle}
            </h2>
            {!latest ? (
              <LoadError text={m.dashboard.loadError} />
            ) : latest.length ? (
              <OrderTable rows={latest} m={m} caption={m.dashboard.latestTitle} />
            ) : (
              <p className="text-muted">{m.dashboard.noOrders}</p>
            )}
            <p>
              <Link href="/beheer/bestellingen" className="font-medium underline decoration-2 underline-offset-4">
                {m.dashboard.allOrders}
              </Link>
            </p>
          </section>
        </>
      ) : null}

      {reviews ? (
        // docs/BEHEER.md § Dashboard: a low score should be answered.
        <section aria-labelledby="reviews-tile" className={`flex flex-col gap-2 rounded-md bg-surface p-6 ring-1 ring-line ${lowReviews ? "border-l-4 border-warning" : ""}`}>
          <h2 id="reviews-tile" className="font-display text-h2">
            {m.dashboard.reviewsTitle}
          </h2>
          {lowReviews === null ? (
            <LoadError text={m.dashboard.loadError} />
          ) : (
            <p>{lowReviews ? (lowReviews === 1 ? m.dashboard.reviewsLowOne : interpolate(m.dashboard.reviewsLow, { count: lowReviews })) : m.dashboard.reviewsNone}</p>
          )}
          <p>
            <Link href={lowReviews ? "/beheer/beoordelingen?lijst=laag" : "/beheer/beoordelingen"} className="font-medium underline decoration-2 underline-offset-4">
              {m.dashboard.reviewsLink}
            </Link>
          </p>
        </section>
      ) : null}

      {invoices || visits ? (
        <div className="grid gap-4 md:grid-cols-2">
          {invoices ? (
            <section aria-labelledby="invoices-tile" className="flex flex-col gap-2 rounded-md bg-surface p-6 ring-1 ring-line">
              <h2 id="invoices-tile" className="font-display text-h2">
                {m.dashboard.invoicesTitle}
              </h2>
              {totals ? (
                <>
                  <ul className="flex flex-col gap-1 tabular-nums">
                    {totals.years.map((y) => (
                      <li key={y.year} className="flex justify-between gap-4">
                        <span className={y.year === totals.year ? "font-bold" : ""}>{interpolate(m.dashboard.invoicesYear, { year: y.year, count: y.documents })}</span>
                        <span className={y.year === totals.year ? "font-bold" : ""}>{formatMoney(y.total)}</span>
                      </li>
                    ))}
                  </ul>
                  {totals.months.length ? (
                    <ul className="flex flex-col gap-1 border-t border-line pt-2 text-body-sm tabular-nums">
                      {totals.months.map((mo) => (
                        <li key={mo.month} className="flex justify-between gap-4">
                          <Link href={`/beheer/facturen?jaar=${totals.year}&maand=${mo.month}`} className="underline-offset-4 hover:underline">
                            {interpolate(m.dashboard.invoicesMonth, { month: monthName(mo.month), count: mo.documents })}
                          </Link>
                          <span>{formatMoney(mo.total)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted">{m.dashboard.invoicesNone}</p>
                  )}
                  <p className="text-body-sm text-muted">{m.dashboard.invoicesNote}</p>
                </>
              ) : (
                <LoadError text={m.dashboard.loadError} />
              )}
            </section>
          ) : null}
          {visits ? (
            <section aria-labelledby="visits-tile" className="flex flex-col gap-2 rounded-md bg-surface p-6 ring-1 ring-line">
              <h2 id="visits-tile" className="font-display text-h2">
                {m.dashboard.visitsTitle}
              </h2>
              {week && funnel ? (
                <>
                  <p className="tabular-nums">
                    {interpolate(m.dashboard.visitsWeek, { today: week.days.at(-1)?.views ?? 0, week: week.total })}
                  </p>
                  <FunnelList f={funnel} days={30} m={m.stats} />
                  <p>
                    <Link href="/beheer/statistieken" className="font-medium underline decoration-2 underline-offset-4">
                      {m.dashboard.visitsMore}
                    </Link>
                  </p>
                </>
              ) : (
                <LoadError text={m.dashboard.loadError} />
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
