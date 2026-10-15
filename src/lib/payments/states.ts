// The payment and refund state machines (docs/STATE_MACHINES.md § Payment,
// § Refund) and how Mollie's statuses map onto them (D-05). Pure.

export const PAYMENT_STATUSES = ["CREATED", "PENDING", "AUTHORIZED", "UNKNOWN", "PAID", "FAILED", "CANCELED", "EXPIRED", "CHARGED_BACK"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_TERMINAL: readonly PaymentStatus[] = ["FAILED", "CANCELED", "EXPIRED", "CHARGED_BACK"];
/** Not finished at the provider: the customer may still be paying. */
export const PAYMENT_OPEN: readonly PaymentStatus[] = ["CREATED", "PENDING", "AUTHORIZED", "UNKNOWN"];

export type PaymentActor = "customer" | "system" | "provider" | "reconciliation";

type Rule<S> = { from: readonly S[]; to: S; actors: readonly PaymentActor[] };

const PAYMENT_RULES: readonly Rule<PaymentStatus>[] = [
  { from: ["CREATED"], to: "PENDING", actors: ["system", "provider", "reconciliation"] },
  { from: ["CREATED"], to: "UNKNOWN", actors: ["system"] },
  { from: ["CREATED", "UNKNOWN"], to: "PAID", actors: ["provider", "reconciliation"] },
  { from: ["UNKNOWN"], to: "PENDING", actors: ["reconciliation", "provider"] },
  { from: ["UNKNOWN"], to: "FAILED", actors: ["reconciliation"] },
  { from: ["PENDING"], to: "AUTHORIZED", actors: ["provider", "reconciliation"] },
  { from: ["PENDING", "AUTHORIZED"], to: "PAID", actors: ["provider", "reconciliation"] },
  { from: ["CREATED", "PENDING", "AUTHORIZED"], to: "FAILED", actors: ["provider", "reconciliation"] },
  { from: ["CREATED", "PENDING", "AUTHORIZED"], to: "CANCELED", actors: ["provider", "reconciliation"] },
  { from: ["CREATED", "PENDING", "AUTHORIZED"], to: "EXPIRED", actors: ["provider", "reconciliation"] },
  // Paid at Mollie after it failed or expired here (a very late bank). Owner 2026-10-13: record what
  // was paid, and the admin pays it back. Only on Mollie's own answer to our query — every caller of
  // applyProviderPayment asked Mollie first (docs/STATE_MACHINES.md § Payment: never on the body alone).
  { from: ["FAILED", "CANCELED", "EXPIRED"], to: "PAID", actors: ["provider", "reconciliation"] },
  { from: ["PAID"], to: "CHARGED_BACK", actors: ["provider", "reconciliation"] },
];

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus, actor: PaymentActor): boolean {
  return PAYMENT_RULES.some((r) => r.to === to && r.from.includes(from) && r.actors.includes(actor));
}

export const REFUND_STATUSES = ["REQUESTED", "SUBMITTED", "UNKNOWN", "SUCCEEDED", "FAILED"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

const REFUND_RULES: readonly Rule<RefundStatus>[] = [
  { from: ["REQUESTED"], to: "SUBMITTED", actors: ["system"] },
  { from: ["REQUESTED"], to: "UNKNOWN", actors: ["system"] },
  { from: ["UNKNOWN"], to: "SUBMITTED", actors: ["reconciliation"] },
  { from: ["UNKNOWN"], to: "SUCCEEDED", actors: ["reconciliation"] },
  { from: ["UNKNOWN"], to: "FAILED", actors: ["reconciliation"] },
  // A refund Mollie refuses outright never got an id: straight to FAILED.
  { from: ["REQUESTED"], to: "FAILED", actors: ["system"] },
  { from: ["SUBMITTED"], to: "SUCCEEDED", actors: ["provider", "reconciliation"] },
  { from: ["SUBMITTED"], to: "FAILED", actors: ["provider", "reconciliation"] },
];

export function canTransitionRefund(from: RefundStatus, to: RefundStatus, actor: PaymentActor): boolean {
  return REFUND_RULES.some((r) => r.to === to && r.from.includes(from) && r.actors.includes(actor));
}

/** Mollie's payment status → ours (D-05, GEDOCUMENTEERD 2026-10-10). */
export function fromMolliePaymentStatus(status: string): PaymentStatus | null {
  switch (status) {
    case "open":
    case "pending":
      return "PENDING";
    case "authorized":
      return "AUTHORIZED";
    case "paid":
      return "PAID";
    case "canceled":
      return "CANCELED";
    case "expired":
      return "EXPIRED";
    case "failed":
      return "FAILED";
    default:
      return null;
  }
}

/** Mollie's refund status → ours; null = still on its way (queued, pending, processing). */
export function fromMollieRefundStatus(status: string): RefundStatus | null {
  if (status === "refunded") return "SUCCEEDED";
  if (status === "failed" || status === "canceled") return "FAILED";
  return null;
}
