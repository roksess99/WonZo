import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ClearCartWhenPaid, OrderActions, RefreshWhilePending } from "@/components/checkout/OrderActions";
import { Container, StateMessage } from "@/components/ui";
import { refreshPaymentStatus } from "@/lib/checkout";
import { getPool, hasDatabase } from "@/lib/db";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { getMessages, type Messages } from "@/lib/i18n/messages";
import { localizePath } from "@/lib/i18n/paths";
import { add, formatMoney, money } from "@/lib/money";
import { findOrderIdByToken } from "@/lib/orders/store";
import { readOrderView, type OrderView } from "@/lib/orders/view";
import { PAYMENT_OPEN } from "@/lib/payments/states";
import { interpolate } from "@/lib/text";

export async function generateMetadata({ params }: PageProps<"/[lang]/bestelling/[token]">) {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  // Behind a key: never in a search engine, and the key never in a referrer.
  return { title: getMessages(lang).order.metaTitle, robots: { index: false, follow: false }, referrer: "no-referrer" as const };
}

const time = (locale: Locale, d: Date) => new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(d);
const date = (locale: Locale, d: Date) => new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(d);

/** What the page says about where the order is (docs/SCHERMEN.md § Bevestiging en status: what happens now). */
function statusText(o: OrderView, m: Messages["order"], locale: Locale): { title: string; text?: string; tone: "info" | "warning"; pending: boolean } {
  if (o.onHold) return { title: m.onHold, text: m.onHoldText, tone: "info", pending: false };
  const until = time(locale, o.snapshotExpiresAt);
  switch (o.status) {
    case "PENDING_PAYMENT":
      if (o.payment && PAYMENT_OPEN.includes(o.payment) && o.payment !== "UNKNOWN") return { title: m.pending, text: m.pendingText, tone: "info", pending: true };
      return { title: m.unpaid, text: interpolate(m.unpaidText, { time: until }), tone: "info", pending: false };
    case "PAYMENT_FAILED":
      return { title: m.failed, text: interpolate(m.failedText, { time: until }), tone: "warning", pending: false };
    case "PAID":
      return { title: m.paid, text: o.canChange && o.cancelWindowEndsAt ? `${m.paidText} ${interpolate(m.windowText, { time: time(locale, o.cancelWindowEndsAt) })}` : m.paidText, tone: "info", pending: false };
    case "FULFILLMENT_PENDING":
    case "PURCHASED":
    case "PARTIALLY_FULFILLED":
      return { title: m.processing, text: m.processingText, tone: "info", pending: false };
    case "SHIPPED":
      return { title: m.shipped, tone: "info", pending: false };
    case "DELIVERED":
      return { title: m.delivered, tone: "info", pending: false };
    case "COMPLETED":
      return { title: m.completed, tone: "info", pending: false };
    case "CANCELLED": {
      if (!o.paidAt) return { title: m.expired, text: m.expiredText, tone: "info", pending: false };
      const active = o.refunds.filter((r) => r.status !== "FAILED");
      const amount = formatMoney(active.reduce((s, r) => add(s, r.amount), money(0)));
      const done = active.length > 0 && active.every((r) => r.status === "SUCCEEDED");
      return { title: m.cancelled, text: active.length ? interpolate(done ? m.refundDone : m.refundPending, { amount }) : undefined, tone: "info", pending: false };
    }
  }
}

/**
 * The status page of an order, opened with the key from the link — never
 * with an order number (.claude/rules/beveiliging.md § Autorisatie). The
 * status comes from the server, which asks the payment provider itself when
 * a payment is still open; the return URL proves nothing (docs/PAYMENTS.md).
 */
export default async function OrderPage({ params }: PageProps<"/[lang]/bestelling/[token]">) {
  await connection();
  const { lang, token } = await params;
  if (!isLocale(lang)) notFound();
  const m = getMessages(lang);
  const orderId = hasDatabase ? await findOrderIdByToken(getPool(), token) : null;
  if (!orderId) {
    return (
      <Container className="py-8">
        <StateMessage tone="warning" title={m.order.notFoundTitle} text={m.order.notFoundText} action={{ href: localizePath(lang, "/contact"), label: m.contact.title }} />
      </Container>
    );
  }
  await refreshPaymentStatus(orderId);
  const o = await readOrderView(getPool(), orderId);
  if (!o) notFound();
  const s = statusText(o, m.order, lang);
  const c = o.customer;
  const itemCount = o.lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <Container className="flex flex-col gap-6 py-8">
      {s.pending ? <RefreshWhilePending /> : null}
      {o.paidAt ? <ClearCartWhenPaid /> : null}
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-h1 font-bold tabular-nums">{interpolate(m.order.title, { reference: o.reference })}</h1>
        <p className="text-muted">{interpolate(m.order.placedOn, { date: date(lang, o.createdAt) })}</p>
      </div>

      <StateMessage tone={s.tone} title={s.title} text={s.text}>
        <OrderActions
          token={token}
          locale={lang}
          canPay={o.canPay}
          retry={o.status === "PAYMENT_FAILED"}
          canChange={o.canChange}
          customer={{ email: c.email, phone: c.phone, firstName: c.firstName, lastName: c.lastName, postcode: c.postcode, houseNumber: c.houseNumber, street: c.street, city: c.city }}
          refundAmount={formatMoney(o.total)}
          labels={{ ...m.order, ...m.checkout }}
        />
      </StateMessage>
      <p className="text-body-sm text-muted">{m.order.keepLink}</p>

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="order-lines" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
          <h2 id="order-lines" className="font-display text-h2">
            {m.order.linesTitle}
          </h2>
          <ul className="flex flex-col divide-y divide-line">
            {o.lines.map((l) => (
              <li key={l.sku} className="flex justify-between gap-4 py-2 tabular-nums">
                <span>
                  {interpolate(m.checkout.quantityOf, { quantity: l.quantity, name: l.name })}
                  <span className="block text-body-sm text-muted">{interpolate(m.cart.sku, { sku: l.sku })}</span>
                  {l.largeShipping ? <span className="block text-body-sm text-muted">{interpolate(m.cart.largeItem, { cost: formatMoney(l.largeShipping) })}</span> : null}
                </span>
                <span>{formatMoney(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="flex flex-col gap-2 border-t border-line pt-3 tabular-nums">
            <div className="flex justify-between gap-4">
              <dt>{itemCount === 1 ? m.cart.subtotalOne : interpolate(m.cart.subtotal, { count: itemCount })}</dt>
              <dd>{formatMoney(o.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{m.cart.shipping}</dt>
              <dd>{o.shippingStandard.amount === 0 ? m.cart.shippingFree : formatMoney(o.shippingStandard)}</dd>
            </div>
            {o.shippingLarge.amount > 0 ? (
              <div className="flex justify-between gap-4">
                <dt>{m.cart.shippingLarge}</dt>
                <dd>{formatMoney(o.shippingLarge)}</dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2 font-bold">
              <dt>{m.cart.total}</dt>
              <dd className="text-h2">{formatMoney(o.total)}</dd>
            </div>
          </dl>
          <p className="text-body-sm text-muted">{m.cart.inclVat}</p>
          <p className="text-body-sm">
            {interpolate(m.product.delivery, { min: o.delivery.minWorkingDays, max: o.delivery.maxWorkingDays })}
            {" · "}
            {interpolate(m.product.shipsFrom, { country: o.delivery.shipsFrom.map((x) => (m.countries as Record<string, string>)[x] ?? x).join(", ") })}
          </p>
        </section>

        <section aria-labelledby="order-address" className="flex flex-col gap-3 rounded-md bg-surface p-6 ring-1 ring-line">
          <h2 id="order-address" className="font-display text-h2">
            {m.order.deliverTo}
          </h2>
          <address className="not-italic">
            {c.firstName} {c.lastName}
            <br />
            {c.street} {c.houseNumber}
            <br />
            {c.postcode} {c.city}
          </address>
          <h3 className="font-medium">{m.order.contactTitle}</h3>
          <p className="break-all">
            {c.email}
            <br />
            {c.phone}
          </p>
        </section>
      </div>
    </Container>
  );
}
