import Link from "next/link";
import { ReturnCard } from "@/components/admin/ReturnCard";
import { requirePage } from "@/lib/admin/access";
import { adminMessages } from "@/lib/admin/messages";
import { can } from "@/lib/admin/permissions";
import { getPool, hasDatabase } from "@/lib/db";
import { listReturns } from "@/lib/returns";

export async function generateMetadata() {
  await requirePage("retouren");
  return { title: adminMessages().returns.title };
}

/**
 * The returns: open ones first — waiting for the parcel, or for the owner's
 * judgement — and the closed ones on their own tab (docs/BEHEER.md §
 * Retouren). Only the tab is in the URL.
 */
export default async function ReturnsPage({ searchParams }: PageProps<"/beheer/retouren">) {
  const admin = await requirePage("retouren");
  const m = adminMessages();
  const sp = await searchParams;
  const open = sp.tab !== "afgerond";
  const now = new Date();
  // A failure says so; it does not look like "no returns" (docs/BEHEER.md).
  const rows = hasDatabase
    ? await listReturns(getPool(), open).catch((err: unknown) => {
        console.error("[beheer/retouren]", (err as { code?: unknown }).code ?? (err instanceof Error ? err.name : "unknown"));
        return null;
      })
    : [];
  const tab = (to: boolean, label: string) => (
    <Link href={to ? "/beheer/retouren" : "/beheer/retouren?tab=afgerond"} aria-current={open === to ? "page" : undefined} className={open === to ? "font-bold underline" : "underline-offset-4 hover:underline"}>
      {label}
    </Link>
  );
  return (
    <>
      <h1 className="font-display text-h1 font-bold">{m.returns.title}</h1>
      <p className="max-w-prose text-muted">{m.returns.intro}</p>
      <nav aria-label={m.returns.title} className="flex gap-6">
        {tab(true, m.returns.tabOpen)}
        {tab(false, m.returns.tabClosed)}
      </nav>
      {rows === null ? (
        <p role="alert" className="font-medium text-danger">
          {m.dashboard.loadError}
        </p>
      ) : (
        <section aria-label={open ? m.returns.tabOpen : m.returns.tabClosed} className="flex flex-col gap-4 rounded-md bg-surface p-6 ring-1 ring-line">
          {rows.length ? (
            rows.map((r) => <ReturnCard key={r.id} r={r} m={m} canAct={can(admin.role, "retouren")} canRefund={can(admin.role, "terugbetalen")} now={now} showOrder={can(admin.role, "bestellingen")} />)
          ) : (
            <p className="text-muted">{open ? m.returns.empty : m.returns.emptyClosed}</p>
          )}
        </section>
      )}
    </>
  );
}
