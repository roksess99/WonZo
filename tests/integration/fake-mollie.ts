// A stand-in for Mollie (docs/TESTEN.md: no real provider in tests, its
// contract instead), behaving as its documentation says (D-05, 2026-10-10):
// the same idempotency key gives the same payment, statuses change only at
// the provider, a refund carries our id in its metadata. Tests steer it.

import { randomBytes } from "node:crypto";
import { add, money, type Money } from "@/lib/money";
import { ProviderOutcomeUnknown, ProviderRefused, type CreatePaymentRequest, type CreateRefundRequest, type PaymentProvider, type ProviderPayment, type ProviderRefund } from "@/lib/payments/mollie";

type StoredRefund = ProviderRefund & { refundId: string; paymentId: string };

export class FakeMollie implements PaymentProvider {
  readonly name = "mollie" as const;
  payments = new Map<string, ProviderPayment>();
  refunds = new Map<string, StoredRefund>();
  private byKey = new Map<string, string>();
  calls: { op: string; key?: string }[] = [];
  /** The next create call: no answer (the payment is created anyway, or not), or a refusal. */
  next: { create?: "lost-after-create" | "lost-before-create" | "refuse"; refund?: "lost-after-create" | "refuse"; refundStatus?: string } = {};
  /** Every new payment gets this amount instead of the asked one (a broken provider or a tampered snapshot). */
  overrideAmount: Money | null = null;

  async createPayment(req: CreatePaymentRequest): Promise<ProviderPayment> {
    this.calls.push({ op: "createPayment", key: req.key });
    const how = this.next.create;
    this.next.create = undefined;
    if (how === "refuse") throw new ProviderRefused(422, "refused");
    if (how === "lost-before-create") throw new ProviderOutcomeUnknown("timeout");
    const existing = this.byKey.get(req.key);
    if (existing) return this.payments.get(existing)!;
    const id = `tr_${randomBytes(6).toString("hex")}`;
    const p: ProviderPayment = {
      id,
      status: "open",
      amount: this.overrideAmount ?? req.amount,
      method: null,
      checkoutUrl: `https://www.mollie.com/checkout/select-method/${id}`,
      metadata: { orderId: req.metadata.orderId, paymentId: req.metadata.paymentId },
      amountRefunded: money(0),
      amountChargedBack: null,
    };
    this.payments.set(id, p);
    this.byKey.set(req.key, id);
    if (how === "lost-after-create") throw new ProviderOutcomeUnknown("timeout after create");
    return p;
  }

  async getPayment(id: string): Promise<ProviderPayment | null> {
    this.calls.push({ op: "getPayment" });
    const known = this.payments.get(id);
    if (known) return known;
    // A payment of an earlier test (another stand-in): at Mollie every
    // payment ends, so it has expired by now. That also tidies the test
    // database through the real code paths, instead of piling up open payments.
    return /^tr_/.test(id) ? { id, status: "expired", amount: money(0), method: null, checkoutUrl: null, metadata: { orderId: null, paymentId: null }, amountRefunded: null, amountChargedBack: null } : null;
  }

  async createRefund(req: CreateRefundRequest): Promise<ProviderRefund> {
    this.calls.push({ op: "createRefund", key: req.key });
    const how = this.next.refund;
    this.next.refund = undefined;
    if (how === "refuse") throw new ProviderRefused(422, "refused");
    const existing = [...this.refunds.values()].find((r) => r.refundId === req.metadata.refundId);
    if (existing) return existing;
    const r: StoredRefund = { id: `re_${randomBytes(6).toString("hex")}`, status: this.next.refundStatus ?? "pending", amount: req.amount, refundId: req.metadata.refundId, paymentId: req.providerPaymentId };
    this.refunds.set(r.id, r);
    const p = this.payments.get(req.providerPaymentId)!;
    p.amountRefunded = add(p.amountRefunded ?? money(0), req.amount);
    if (how === "lost-after-create") throw new ProviderOutcomeUnknown("timeout after create");
    return r;
  }

  async getRefund(_paymentId: string, refundId: string): Promise<ProviderRefund | null> {
    return this.refunds.get(refundId) ?? null;
  }

  async listRefunds(paymentId: string) {
    return [...this.refunds.values()].filter((r) => r.paymentId === paymentId).map((r) => ({ id: r.id, status: r.status, amount: r.amount, refundId: r.refundId }));
  }

  // --- steering, as the customer and the bank would

  setStatus(id: string, status: string) {
    this.payments.get(id)!.status = status;
  }
  chargeBack(id: string) {
    const p = this.payments.get(id)!;
    p.amountChargedBack = p.amount;
  }
  settleRefunds(status = "refunded") {
    for (const r of this.refunds.values()) r.status = status;
  }
  idOfOrder(orderId: number): string {
    const all = [...this.payments.values()].filter((p) => p.metadata.orderId === orderId);
    return all[all.length - 1]!.id;
  }
}
