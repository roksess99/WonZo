import Link from "next/link";
import { shortDate } from "@/components/admin/format";
import { ReviewAdminActions } from "@/components/admin/ReviewAdminActions";
import { Stars } from "@/components/reviews/ReviewList";
import { requirePage } from "@/lib/admin/access";
import { adminMessages } from "@/lib/admin/messages";
import { can } from "@/lib/admin/permissions";
import { getPool, hasDatabase } from "@/lib/db";
import { adminReviews, upcomingInvites } from "@/lib/reviews";
import { interpolate } from "@/lib/text";

export async function generateMetadata() {
  await requirePage("beoordelingen");
  return { title: adminMessages().reviews.title };
}

const TABS = { alle: "all", laag: "low", verborgen: "hidden" } as const;

/**
 * Reviews (D-12, docs/BEHEER.md § Beoordelingen): answer, hide only with a
 * reason, and see which orders will be invited and when. Marketing may open
 * this screen, so it shows the order number — never the customer's name or
 * address (the description of 2026-10-12, §7).
 */
export default async function ReviewsAdminPage({ searchParams }: PageProps<"/beheer/beoordelingen">) {
  const admin = await requirePage("beoordelingen");
  const am = adminMessages();
  const m = am.reviews;
  const sp = await searchParams;
  const tab = (Object.keys(TABS) as (keyof typeof TABS)[]).find((k) => k === sp.lijst) ?? "alle";
  const failed = (err: unknown) => {
    console.error("[beheer/beoordelingen]", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown"));
    return null;
  };
  const [rows, upcoming] = hasDatabase ? await Promise.all([adminReviews(getPool(), TABS[tab]).catch(failed), upcomingInvites(getPool()).catch(failed)]) : [[], []];
  const showOrders = can(admin.role, "bestellingen");
  const labels = { all: m.tabAll, low: m.tabLow, hidden: m.tabHidden };

  return (
    <>
      <h1 className="font-display text-h1 font-bold">{m.title}</h1>
      <p className="max-w-prose text-muted">{m.intro}</p>
      <nav aria-label={m.title} className="flex flex-wrap gap-6">
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((k) => (
          <Link key={k} href={k === "alle" ? "/beheer/beoordelingen" : `/beheer/beoordelingen?lijst=${k}`} aria-current={k === tab ? "page" : undefined} className={k === tab ? "font-bold underline" : "underline-offset-4 hover:underline"}>
            {labels[TABS[k]]}
          </Link>
        ))}
      </nav>
      {rows === null ? (
        <p role="alert" className="font-medium text-danger">
          {am.dashboard.loadError}
        </p>
      ) : (
        <section aria-label={labels[TABS[tab]]} className="flex flex-col gap-4 rounded-md bg-surface p-6 ring-1 ring-line">
          {rows.length ? (
            rows.map((r) => (
              <article key={r.id} className="flex flex-col gap-2 border-b border-line pb-4 last:border-b-0 last:pb-0">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Stars rating={r.rating} label={interpolate(m.rating, { rating: r.rating })} />
                  <span className="font-medium">{r.subject === "shop" ? m.subjectShop : interpolate(m.subjectProduct, { name: r.productName ?? "" })}</span>
                  <span className="text-body-sm text-muted">
                    {shortDate(r.createdAt)} · {r.name ?? m.anonymous} ·{" "}
                    {showOrders ? (
                      <Link href={`/beheer/bestellingen/${r.orderId}`} className="underline-offset-4 hover:underline">
                        {interpolate(m.order, { reference: r.orderReference })}
                      </Link>
                    ) : (
                      interpolate(m.order, { reference: r.orderReference })
                    )}
                  </span>
                </p>
                {r.body ? <p className="max-w-prose whitespace-pre-line">{r.body}</p> : null}
                {r.status === "HIDDEN" ? <p className="text-body-sm font-medium text-danger">{interpolate(m.hidden, { reason: r.hiddenReason ?? "" })}</p> : null}
                {r.reply ? (
                  <div className="ms-4 border-s-2 border-line ps-3 text-body-sm">
                    <p className="font-medium">{m.reply}</p>
                    <p className="whitespace-pre-line">{r.reply}</p>
                  </div>
                ) : null}
                <ReviewAdminActions reviewId={r.id} reply={r.reply} hidden={r.status === "HIDDEN"} m={m} labels={{ reasonLabel: am.actions.reasonLabel, back: am.actions.back, busy: am.actions.busy }} />
              </article>
            ))
          ) : (
            <p className="text-muted">{m.empty}</p>
          )}
        </section>
      )}
      <section aria-labelledby="upcoming" className="flex flex-col gap-2 rounded-md bg-surface p-6 ring-1 ring-line">
        <h2 id="upcoming" className="font-display text-h2">
          {m.upcomingTitle}
        </h2>
        <p className="text-body-sm text-muted">{m.upcomingText}</p>
        {upcoming === null ? (
          <p role="alert" className="font-medium text-danger">
            {am.dashboard.loadError}
          </p>
        ) : upcoming.length ? (
          <ul className="flex flex-col gap-1 tabular-nums">
            {upcoming.map((u) => (
              <li key={u.orderId}>{interpolate(m.upcomingLine, { reference: u.reference, date: shortDate(u.dueAt) })}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{m.upcomingNone}</p>
        )}
      </section>
    </>
  );
}
