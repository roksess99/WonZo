import Link from "next/link";
import { OrderSearch } from "@/components/admin/OrderSearch";
import { OrderTable } from "@/components/admin/OrderTable";
import { requirePage } from "@/lib/admin/access";
import { adminMessages } from "@/lib/admin/messages";
import { isOrderGroup, listOrders, ORDER_GROUPS, type OrderGroup } from "@/lib/admin/orders";
import { getPool, hasDatabase } from "@/lib/db";
import { interpolate } from "@/lib/text";

export async function generateMetadata() {
  await requirePage("bestellingen");
  return { title: adminMessages().orders.title };
}

/**
 * The order list: a work queue, not an archive (docs/BEHEER.md § De lijst).
 * Tab and page in the URL — no personal data in it; searching goes by POST.
 */
export default async function OrdersPage({ searchParams }: PageProps<"/beheer/bestellingen">) {
  await requirePage("bestellingen");
  const m = adminMessages();
  const sp = await searchParams;
  const group: OrderGroup = isOrderGroup(sp.lijst) ? sp.lijst : "te-doen";
  const page = Math.max(1, Number.parseInt(String(sp.pagina ?? "1"), 10) || 1);
  const list = hasDatabase ? await listOrders(getPool(), group, page) : { rows: [], total: 0, pages: 1 };
  const at = Math.min(page, list.pages);
  const href = (g: OrderGroup, p = 1) => `/beheer/bestellingen?lijst=${g}${p > 1 ? `&pagina=${p}` : ""}`;

  return (
    <>
      <h1 className="font-display text-h1 font-bold">{m.orders.title}</h1>
      <OrderSearch m={m} />
      <nav aria-label={m.orders.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {(Object.keys(ORDER_GROUPS) as OrderGroup[]).map((g) => (
            <li key={g}>
              <Link
                href={href(g)}
                aria-current={g === group ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-md px-4 font-medium ring-1 ring-line ${g === group ? "bg-petrol text-on-petrol" : "bg-surface"}`}
              >
                {m.groups[g]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <section aria-labelledby="list-title" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
        <h2 id="list-title" className="font-display text-h2">
          {m.groups[group]} <span className="text-body text-muted">({list.total === 1 ? m.orders.countOne : interpolate(m.orders.count, { count: list.total })})</span>
        </h2>
        {list.rows.length ? (
          <OrderTable rows={list.rows} m={m} caption={m.groups[group]} />
        ) : (
          <p className="text-muted">{group === "te-doen" ? m.orders.emptyTodo : m.orders.empty}</p>
        )}
        {list.pages > 1 ? (
          <nav aria-label={interpolate(m.orders.page, { page: at, pages: list.pages })} className="flex items-center gap-4">
            {at > 1 ? (
              <Link href={href(group, at - 1)} className="underline underline-offset-4">
                {m.orders.previous}
              </Link>
            ) : null}
            <span className="text-body-sm text-muted">{interpolate(m.orders.page, { page: at, pages: list.pages })}</span>
            {at < list.pages ? (
              <Link href={href(group, at + 1)} className="underline underline-offset-4">
                {m.orders.next}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </>
  );
}
