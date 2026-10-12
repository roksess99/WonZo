import Link from "next/link";
import { notFound } from "next/navigation";
import { holdText } from "@/components/admin/AttentionList";
import { dateTime, shortDate, time, vatRate } from "@/components/admin/format";
import { OrderActionsPanel } from "@/components/admin/OrderActionsPanel";
import { requirePage } from "@/lib/admin/access";
import { adminMessages } from "@/lib/admin/messages";
import { adminOptions } from "@/lib/admin/order-actions";
import { readAdminOrder } from "@/lib/admin/orders";
import { can } from "@/lib/admin/permissions";
import { orderingMode } from "@/lib/catalog/ordering";
import { getPool, hasDatabase } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { interpolate } from "@/lib/text";

export async function generateMetadata({ params }: PageProps<"/beheer/bestellingen/[id]">) {
  await requirePage("bestellingen");
  const { id } = await params;
  return { title: `${adminMessages().nav.orders} ${id}` };
}

const safeOrderingMode = () => {
  try {
    return orderingMode(process.env);
  } catch {
    return "off";
  }
};

const orderId = (raw: string) => (/^[1-9]\d{0,15}$/.test(raw) ? Number(raw) : null);

/**
 * One order, as a control screen: purchasing is automatic (D-04), so this
 * says at a glance whether everything went right, and if not, what the
 * choices are (docs/BEHEER.md § De bestelling zelf).
 */
export default async function AdminOrderPage({ params }: PageProps<"/beheer/bestellingen/[id]">) {
  const admin = await requirePage("bestellingen");
  const m = adminMessages();
  const { id } = await params;
  const oid = orderId(id);
  const order = oid && hasDatabase ? await readAdminOrder(getPool(), oid) : null;
  // A real 404, also for the admin (docs/CHECKLIST.md § Techniek).
  if (!order) notFound();
  const c = order.customer;
  const orderingOff = safeOrderingMode() === "off";
  const options = adminOptions(order);
  const hold = order.holdReason ? holdText(m, order.holdReason) : null;
  // Cancelling a paid order before purchasing is always offered; the block only turns red when something is wrong.
  const needsAttention = order.holdReason !== null || options.refundPayments.length > 0 || options.heldUnpaid || options.paidLate || options.acceptPrice !== null || options.retryPurchase !== null;
  const hasActions = needsAttention || options.cancel !== null;

  return (
    <>
      <p>
        <Link href="/beheer/bestellingen" className="underline underline-offset-4">
          {m.order.back}
        </Link>
      </p>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-h1 font-bold tabular-nums">{order.reference}</h1>
        <p className="text-h2 font-display">
          {m.status[order.status]}
          {order.holdReason ? <span className="ms-3 rounded-sm bg-danger-soft px-2 py-0.5 align-middle text-body font-medium text-danger">{m.orders.onHold}</span> : null}
        </p>
        <p className="text-muted">
          {interpolate(m.order.placedOn, { date: dateTime(order.createdAt) })}
          {order.paidAt ? ` · ${interpolate(m.order.paidOn, { date: dateTime(order.paidAt) })}` : ""}
        </p>
        {order.status === "PAID" && order.cancelWindowEndsAt && order.cancelWindowEndsAt > new Date() ? (
          <p>{interpolate(m.order.windowUntil, { time: time(order.cancelWindowEndsAt) })}</p>
        ) : null}
        {order.status === "PENDING_PAYMENT" || order.status === "PAYMENT_FAILED" ? <p>{interpolate(m.order.notPaidUntil, { time: shortDate(order.snapshotExpiresAt) })}</p> : null}
      </div>

      {hasActions ? (
        <section aria-labelledby="actions" className={`flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line ${needsAttention ? "border-l-4 border-danger" : ""}`}>
          <h2 id="actions" className="font-display text-h2">
            {hold ? m.actions.holdTitle : m.actions.title}
          </h2>
          {hold ? (
            <p>
              <span className="font-medium">{hold.what}.</span> {hold.todo}
            </p>
          ) : null}
          <OrderActionsPanel
            orderId={order.id}
            holdReason={order.holdReason}
            options={options}
            canManage={can(admin.role, "bestellingen")}
            canRefund={can(admin.role, "terugbetalen")}
            m={m.actions}
          />
        </section>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="lines" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
          <h2 id="lines" className="font-display text-h2">
            {m.order.linesTitle}
          </h2>
          {/* On a phone the less urgent columns drop out instead of scrolling sideways (docs/BEHEER.md § Op een telefoon). */}
          <table className="w-full border-collapse text-start tabular-nums">
            <thead className="text-body-sm text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pe-4 text-start font-medium">{m.order.colArticle}</th>
                <th scope="col" className="hidden py-2 pe-4 text-start font-medium sm:table-cell">{m.order.colSupplierSku}</th>
                <th scope="col" className="py-2 pe-4 text-end font-medium">{m.order.colQuantity}</th>
                <th scope="col" className="hidden py-2 pe-4 text-end font-medium md:table-cell">{m.order.colPrice}</th>
                <th scope="col" className="hidden py-2 pe-4 text-end font-medium md:table-cell">{m.order.colCost}</th>
                <th scope="col" className="py-2 text-end font-medium">{m.order.colTotal}</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.lineNo} className="border-b border-line align-top">
                  <td className="py-2 pe-4">
                    {l.name}
                    {l.brand ? <span className="block text-body-sm text-muted">{l.brand}</span> : null}
                    {l.largeShipping ? <span className="block text-body-sm text-muted">{interpolate(m.order.largeItem, { cost: formatMoney(l.largeShipping) })}</span> : null}
                    <span className="block text-body-sm text-muted sm:hidden">
                      {m.order.colSupplierSku}: {l.sku}
                    </span>
                  </td>
                  <td className="hidden py-2 pe-4 sm:table-cell">
                    {l.sku}
                    <span className="block text-body-sm text-muted">
                      {m.order.colOffer}: {l.offerId}
                    </span>
                  </td>
                  <td className="py-2 pe-4 text-end">{l.quantity}</td>
                  <td className="hidden py-2 pe-4 text-end md:table-cell">
                    {formatMoney(l.unitPrice)}
                    <span className="block text-body-sm text-muted">{interpolate(m.order.vatRate, { rate: vatRate(l.vatRateBp) })}</span>
                  </td>
                  <td className="hidden py-2 pe-4 text-end md:table-cell">{formatMoney(l.supplierCost)}</td>
                  <td className="py-2 text-end">{formatMoney(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-body-sm text-muted">{m.order.costNote}</p>
          <dl className="ms-auto flex w-full max-w-sm flex-col gap-1 tabular-nums">
            <div className="flex justify-between gap-4">
              <dt>{m.order.subtotal}</dt>
              <dd>{formatMoney(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{m.order.shipping}</dt>
              <dd>{formatMoney(order.shippingStandard)}</dd>
            </div>
            {order.shippingLarge.amount > 0 ? (
              <div className="flex justify-between gap-4">
                <dt>{m.order.shippingLarge}</dt>
                <dd>{formatMoney(order.shippingLarge)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-t border-line pt-1 font-bold">
              <dt>{m.order.total}</dt>
              <dd>{formatMoney(order.total)}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="address" className="flex flex-col gap-2 rounded-md bg-surface p-6 ring-1 ring-line">
          <h2 id="address" className="font-display text-h2">
            {m.order.addressTitle}
          </h2>
          <address className="not-italic">
            {c.firstName} {c.lastName}
            <br />
            {c.street} {c.houseNumber}
            <br />
            {c.postcode} {c.city}
            <br />
            {c.country}
          </address>
          <h3 className="font-medium">{m.order.contactTitle}</h3>
          <p className="break-all">
            {c.email}
            <br />
            {c.phone}
          </p>
        </section>
      </div>

      <section aria-labelledby="payments" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
        <h2 id="payments" className="font-display text-h2">
          {m.order.paymentsTitle}
        </h2>
        {order.payments.length ? (
          <table className="w-full border-collapse text-start tabular-nums">
            <thead className="text-body-sm text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pe-4 text-start font-medium">{m.order.colWhen}</th>
                <th scope="col" className="py-2 pe-4 text-start font-medium">{m.orders.colStatus}</th>
                <th scope="col" className="hidden py-2 pe-4 text-start font-medium sm:table-cell">{m.order.colMethod}</th>
                <th scope="col" className="hidden py-2 pe-4 text-start font-medium md:table-cell">{m.order.colMollie}</th>
                <th scope="col" className="py-2 text-end font-medium">{m.order.colAmount}</th>
              </tr>
            </thead>
            <tbody>
              {order.payments.map((p) => (
                <tr key={p.id} className="border-b border-line">
                  <td className="py-2 pe-4">{shortDate(p.createdAt)}</td>
                  <td className="py-2 pe-4">{m.paymentStatus[p.status]}</td>
                  <td className="hidden py-2 pe-4 sm:table-cell">{p.method ?? "—"}</td>
                  <td className="hidden py-2 pe-4 md:table-cell">{p.providerPaymentId ?? "—"}</td>
                  <td className="py-2 text-end">{formatMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted">{m.order.noPayments}</p>
        )}
        {order.refunds.length ? (
          <>
            <h3 className="font-medium">{m.order.refundsTitle}</h3>
            <ul className="flex flex-col divide-y divide-line">
              {order.refunds.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-x-4 py-2 tabular-nums">
                  <span>
                    {shortDate(r.createdAt)} · {m.refundStatus[r.status]}
                    <span className="block text-body-sm text-muted">{interpolate(m.order.refundBy, { by: r.requestedBy, reason: r.reason })}</span>
                  </span>
                  <span>{formatMoney(r.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section aria-labelledby="purchase" className="flex flex-col gap-2 rounded-md bg-surface p-6 ring-1 ring-line">
        <h2 id="purchase" className="font-display text-h2">
          {m.order.purchaseTitle}
        </h2>
        {order.purchases.length ? (
          <ul className="flex flex-col gap-4">
            {order.purchases.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 tabular-nums">
                <p className="font-medium">
                  {m.purchaseStatus[p.status]}
                  {p.status === "DRAFT" && orderingOff ? <span className="ms-2 text-body-sm font-normal text-muted">{m.order.purchaseWaitingOff}</span> : null}
                </p>
                <p className="text-body-sm">{interpolate(m.order.purchaseReference, { reference: p.reference })}</p>
                {p.supplierOrderRef ? <p className="text-body-sm">{interpolate(m.order.purchaseSupplierRef, { ref: p.supplierOrderRef })}</p> : null}
                <p className="text-body-sm text-muted">{interpolate(m.order.purchaseExpected, { amount: formatMoney(p.expectedCost) })}</p>
                {p.checkedProducts && p.checkedTotal ? (
                  <p className="text-body-sm text-muted">{interpolate(m.order.purchaseChecked, { products: formatMoney(p.checkedProducts), total: formatMoney(p.checkedTotal) })}</p>
                ) : null}
                {p.priceAcceptedBy ? <p className="text-body-sm text-muted">{interpolate(m.order.purchaseAccepted, { by: p.priceAcceptedBy })}</p> : null}
                {p.attempts ? <p className="text-body-sm text-muted">{interpolate(m.order.purchaseAttempts, { count: p.attempts })}</p> : null}
                {p.lastError ? <p className="text-body-sm text-danger">{interpolate(m.order.purchaseLastError, { error: p.lastError })}</p> : null}
                {(p.status === "DRAFT" || p.status === "REJECTED" || p.status === "UNKNOWN") && !p.gaveUpAt && !p.blockedReason && !orderingOff ? (
                  <p className="text-body-sm text-muted">{interpolate(m.order.purchaseNext, { time: shortDate(p.nextAttemptAt) })}</p>
                ) : null}
                <ol className="mt-1 flex flex-col gap-1 text-body-sm text-muted">
                  {p.events.map((e, i) => (
                    <li key={i}>
                      {shortDate(e.at)} · {m.purchaseStatus[e.to as keyof typeof m.purchaseStatus] ?? e.to} {interpolate(m.order.historyBy, { actor: e.actor })}
                      {e.reason ? ` — ${e.reason}` : ""}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">{m.order.purchaseNotYet}</p>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="history" className="flex flex-col gap-2 rounded-md bg-surface p-6 ring-1 ring-line">
          <h2 id="history" className="font-display text-h2">
            {m.order.historyTitle}
          </h2>
          <ol className="flex flex-col gap-2">
            {order.events.map((e, i) => (
              <li key={i}>
                <span className="tabular-nums text-muted">{shortDate(e.at)}</span> · {m.status[e.to as keyof typeof m.status] ?? e.to}{" "}
                <span className="text-body-sm text-muted">{interpolate(m.order.historyBy, { actor: e.actor })}</span>
                {e.reason ? <span className="block text-body-sm text-muted">{e.reason}</span> : null}
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="audit" className="flex flex-col gap-2 rounded-md bg-surface p-6 ring-1 ring-line">
          <h2 id="audit" className="font-display text-h2">
            {m.order.auditTitle}
          </h2>
          {order.audit.length ? (
            <ol className="flex flex-col gap-2">
              {order.audit.map((a, i) => (
                <li key={i}>
                  <span className="tabular-nums text-muted">{shortDate(a.at)}</span> · {a.action}{" "}
                  <span className="text-body-sm text-muted">{interpolate(m.order.historyBy, { actor: a.actor })}</span>
                  {a.reason ? <span className="block text-body-sm text-muted">{a.reason}</span> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted">{m.order.noAudit}</p>
          )}
        </section>
      </div>
    </>
  );
}
