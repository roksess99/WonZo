import type { AdminMessages } from "@/lib/admin/messages";
import type { SupplierHealth } from "@/lib/catalog/supplier-status";
import type { MailHealth } from "@/lib/mail";
import type { PaymentHealth } from "@/lib/payments/health";
import { interpolate } from "@/lib/text";
import { AlertIcon, InfoIcon } from "../icons";
import { shortDate } from "./format";

type Notice = { tone: "danger" | "info"; title: string; text?: string };

/** How purchasing at the supplier stands (SUPPLIER_ORDERING), with the purchase orders that wait. */
export type OrderingStatus = { mode: "off" | "sandbox" | "live" | "bad-config"; waiting: number };

function mailNotices(h: MailHealth, m: AdminMessages["health"]): Notice[] {
  switch (h.state) {
    case "not-configured":
      return [{ tone: "danger", title: m.mailNotConfigured }];
    case "bad-config":
      return [{ tone: "danger", title: m.mailBadConfig, text: m.mailBadConfigText }];
    case "held":
      return [{ tone: "info", title: m.mailHeld }];
    case "redirect":
      return [{ tone: "info", title: interpolate(m.mailRedirect, { to: h.to }) }];
    case "login-failed":
      return [{ tone: "danger", title: m.mailLoginFailed, text: m.mailLoginFailedText }];
    case "ok":
      return [];
  }
}

function orderingNotices(o: OrderingStatus, m: AdminMessages["health"]): Notice[] {
  switch (o.mode) {
    case "bad-config":
      return [{ tone: "danger", title: m.orderingBadConfig, text: m.orderingBadConfigText }];
    case "off":
      return [{ tone: "info", title: o.waiting === 1 ? m.orderingOffOne : interpolate(m.orderingOff, { count: o.waiting }), text: m.orderingOffText }];
    case "sandbox":
      return [{ tone: "info", title: m.orderingSandbox }];
    case "live":
      return [];
  }
}

function paymentNotices(h: PaymentHealth, m: AdminMessages["health"]): Notice[] {
  switch (h.state) {
    case "no-key":
      return [{ tone: "danger", title: m.mollieNoKey, text: m.mollieNoKeyText }];
    case "bad-config":
      return [{ tone: "danger", title: m.mollieBadConfig, text: m.mollieBadConfigText }];
    case "refused":
      return [{ tone: "danger", title: interpolate(m.mollieRefused, { status: h.status }), text: m.mollieRefusedText }];
    case "unreachable":
      return [{ tone: "danger", title: m.mollieUnreachable, text: m.mollieUnreachableText }];
    case "methods-inactive":
      return [
        { tone: "danger", title: h.active.length ? interpolate(m.mollieInactive, { methods: h.inactive.join(", ") }) : m.mollieNoneActive, text: m.mollieInactiveText },
        ...(h.testMode ? [{ tone: "info" as const, title: m.mollieTestMode }] : []),
      ];
    case "ok":
      return h.testMode ? [{ tone: "info", title: m.mollieTestMode }] : [];
  }
}

function supplierNotices(h: SupplierHealth, m: AdminMessages["health"]): Notice[] {
  switch (h.state) {
    case "no-key":
      return [{ tone: "info", title: m.bigbuyNoKey }];
    case "refused":
      return [{ tone: "danger", title: interpolate(m.bigbuyRefused, { since: shortDate(h.since) }), text: m.bigbuyRefusedText }];
    case "unreachable":
      return [{ tone: "danger", title: interpolate(m.bigbuyUnreachable, { since: shortDate(h.since) }), text: m.bigbuyUnreachableText }];
    case "quiet":
      return [{ tone: "danger", title: m.bigbuyQuiet, text: m.bigbuyQuietText }];
    case "ok":
      return [];
  }
}

/**
 * Red at the top for everyone, whatever their role: a shop where nobody can
 * pay is not a question of permissions (docs/BEHEER.md § Een werkende
 * sleutel is geen werkende kassa).
 */
export function HealthAlerts({ payment, supplier, ordering, mail, m }: { payment: PaymentHealth; supplier: SupplierHealth; ordering: OrderingStatus; mail: MailHealth; m: AdminMessages["health"] }) {
  // Red first, whatever the order of the checks.
  const notices = [...paymentNotices(payment, m), ...supplierNotices(supplier, m), ...mailNotices(mail, m), ...orderingNotices(ordering, m)].sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "danger" ? -1 : 1));
  if (!notices.length) return null;
  return (
    <ul className="flex flex-col gap-3">
      {notices.map((n) => {
        const Icon = n.tone === "danger" ? AlertIcon : InfoIcon;
        return (
          <li
            key={n.title}
            role={n.tone === "danger" ? "alert" : "status"}
            className={`flex gap-3 rounded-md border-l-4 p-4 ${n.tone === "danger" ? "border-danger bg-danger-soft" : "border-petrol bg-surface ring-1 ring-line"}`}
          >
            <Icon className={`mt-0.5 size-5 shrink-0 ${n.tone === "danger" ? "text-danger" : ""}`} />
            <div className="flex flex-col gap-1">
              <p className="font-bold">{n.title}</p>
              {n.text ? <p className="text-body-sm">{n.text}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
