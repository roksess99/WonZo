// The payment provider (D-05: Mollie, hosted checkout). The only file that
// knows Mollie's API; the rest of the shop talks to PaymentProvider.
// Behaviour GEDOCUMENTEERD (docs.mollie.com, 2026-10-10), still to measure in
// test mode: webhook with only an id and no signature, Idempotency-Key on
// every POST (kept one hour), amounts as strings with two decimals.
// Server-side only: the key is a secret.

import { fromDecimal, type Money } from "@/lib/money";

if (typeof window !== "undefined") throw new Error("The payment provider must not run in the browser");

export type ProviderPayment = {
  id: string;
  /** Mollie's own status word; mapped in ./states.ts. */
  status: string;
  amount: Money;
  method: string | null;
  /** The provider's payment page; only an https address of the provider. */
  checkoutUrl: string | null;
  metadata: { orderId: number | null; paymentId: string | null };
  amountRefunded: Money | null;
  amountChargedBack: Money | null;
};

export type ProviderRefund = { id: string; status: string; amount: Money };

export type CreatePaymentRequest = {
  /** Our payment id: the idempotency key (docs/IDEMPOTENCY.md). */
  key: string;
  amount: Money;
  description: string;
  redirectUrl: string;
  /** null when the shop runs on localhost: the provider cannot reach it, the return page asks instead. */
  webhookUrl: string | null;
  locale: "nl" | "en";
  metadata: { orderId: number; paymentId: string };
};

export type CreateRefundRequest = { key: string; providerPaymentId: string; amount: Money; description: string; metadata: { orderId: number; refundId: string } };

export interface PaymentProvider {
  readonly name: "mollie";
  createPayment(req: CreatePaymentRequest): Promise<ProviderPayment>;
  /** null: the provider does not know this payment (404). */
  getPayment(providerPaymentId: string): Promise<ProviderPayment | null>;
  createRefund(req: CreateRefundRequest): Promise<ProviderRefund>;
  getRefund(providerPaymentId: string, providerRefundId: string): Promise<ProviderRefund | null>;
  /** Every refund of a payment, with our refund id from the metadata: finds one whose answer was lost. */
  listRefunds(providerPaymentId: string): Promise<(ProviderRefund & { refundId: string | null })[]>;
}

/** The request may or may not have arrived (timeout, network): the outcome is UNKNOWN, never "failed". */
export class ProviderOutcomeUnknown extends Error {}
/** The provider answered with a refusal (4xx): definite, nothing was created. */
export class ProviderRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** iDEAL, Apple Pay and cards; Google Pay is shown under cards (D-05). */
export const METHODS = ["ideal", "applepay", "creditcard"] as const;

export type MollieConfig = { apiKey: string; testMode: boolean };

/**
 * MOLLIE_API_KEY, checked when the code loads. Empty: no provider (checkout
 * cannot start). A live key outside production is refused: on a development
 * machine "just testing" would move real money (.claude/rules/beveiliging.md § Secrets).
 */
export function parseMollieConfig(env: Record<string, string | undefined>): MollieConfig | null {
  const key = (env.MOLLIE_API_KEY ?? "").trim();
  if (!key) return null;
  const m = /^(test|live)_[A-Za-z0-9]{20,}$/.exec(key);
  if (!m) throw new Error("MOLLIE_API_KEY is not a Mollie API key (test_… or live_…).");
  if (m[1] === "live" && env.NODE_ENV !== "production") throw new Error("A live MOLLIE_API_KEY is refused outside production: use the test key on this machine.");
  return { apiKey: key, testMode: m[1] === "test" };
}

/** Money → Mollie's amount: an exact string with two decimals, no float on the way. */
export function toMollieAmount(m: Money): { currency: string; value: string } {
  if (!Number.isSafeInteger(m.amount) || m.amount < 0) throw new Error(`Not a payable amount: ${m.amount}`);
  return { currency: m.currency, value: `${Math.floor(m.amount / 100)}.${String(m.amount % 100).padStart(2, "0")}` };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function parseAmount(x: unknown): Money | null {
  if (!isObj(x) || x.currency !== "EUR" || typeof x.value !== "string") return null;
  try {
    return fromDecimal(x.value);
  } catch {
    return null;
  }
}

function isProviderPage(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && (url.hostname === "mollie.com" || url.hostname.endsWith(".mollie.com"));
  } catch {
    return false;
  }
}

/** A payment from Mollie, checked at the edge; null when it is not one. */
export function parsePayment(x: unknown): ProviderPayment | null {
  if (!isObj(x) || typeof x.id !== "string" || !/^tr_[A-Za-z0-9]{4,30}$/.test(x.id) || typeof x.status !== "string") return null;
  const amount = parseAmount(x.amount);
  if (!amount) return null;
  const meta = isObj(x.metadata) ? x.metadata : {};
  const links = isObj(x._links) ? x._links : {};
  const checkout = isObj(links.checkout) ? links.checkout.href : null;
  return {
    id: x.id,
    status: x.status,
    amount,
    method: typeof x.method === "string" ? x.method : null,
    checkoutUrl: isProviderPage(checkout) ? checkout : null,
    metadata: {
      orderId: typeof meta.orderId === "number" && Number.isSafeInteger(meta.orderId) ? meta.orderId : null,
      paymentId: typeof meta.paymentId === "string" ? meta.paymentId : null,
    },
    amountRefunded: x.amountRefunded === undefined ? null : parseAmount(x.amountRefunded),
    amountChargedBack: x.amountChargedBack === undefined ? null : parseAmount(x.amountChargedBack),
  };
}

export function parseRefund(x: unknown): ProviderRefund | null {
  if (!isObj(x) || typeof x.id !== "string" || !/^re_[A-Za-z0-9]{4,30}$/.test(x.id) || typeof x.status !== "string") return null;
  const amount = parseAmount(x.amount);
  return amount ? { id: x.id, status: x.status, amount } : null;
}

const API = "https://api.mollie.com/v2";
const TIMEOUT_MS = 10_000;

/** The real Mollie, over HTTPS. `fetchImpl` is replaceable for tests. */
export function mollieProvider(config: MollieConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  async function call(method: "GET" | "POST", path: string, body?: unknown, key?: string): Promise<unknown> {
    let res: Response;
    try {
      res = await fetchImpl(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // No answer: for a POST the payment may exist anyway.
      throw new ProviderOutcomeUnknown(`${method} ${path}: no answer`);
    }
    if (method === "GET" && res.status === 404) return null;
    const json: unknown = await res.json().catch(() => null);
    // 409: the same key is still being processed — the outcome is not known yet.
    if (res.status === 409 || res.status >= 500) throw new ProviderOutcomeUnknown(`${method} ${path}: HTTP ${res.status}`);
    if (res.status >= 400) {
      const detail = isObj(json) && typeof json.detail === "string" ? json.detail.slice(0, 200) : "";
      throw new ProviderRefused(res.status, `${method} ${path}: HTTP ${res.status} ${detail}`);
    }
    return json;
  }
  const payment = (x: unknown): ProviderPayment => {
    const p = parsePayment(x);
    if (!p) throw new ProviderOutcomeUnknown("unreadable payment from the provider");
    return p;
  };
  const refund = (x: unknown): ProviderRefund => {
    const r = parseRefund(x);
    if (!r) throw new ProviderOutcomeUnknown("unreadable refund from the provider");
    return r;
  };
  const safeId = (id: string, prefix: string) => {
    if (!new RegExp(`^${prefix}_[A-Za-z0-9]{4,30}$`).test(id)) throw new Error(`Not a provider id: ${id}`);
    return id;
  };

  return {
    name: "mollie",
    async createPayment(req) {
      return payment(
        await call(
          "POST",
          "/payments",
          {
            amount: toMollieAmount(req.amount),
            description: req.description.slice(0, 255),
            redirectUrl: req.redirectUrl,
            ...(req.webhookUrl ? { webhookUrl: req.webhookUrl } : {}),
            locale: req.locale === "nl" ? "nl_NL" : "en_US",
            method: [...METHODS],
            metadata: req.metadata,
          },
          req.key,
        ),
      );
    },
    async getPayment(id) {
      const json = await call("GET", `/payments/${safeId(id, "tr")}`);
      return json === null ? null : payment(json);
    },
    async createRefund(req) {
      return refund(
        await call(
          "POST",
          `/payments/${safeId(req.providerPaymentId, "tr")}/refunds`,
          { amount: toMollieAmount(req.amount), description: req.description.slice(0, 140), metadata: req.metadata },
          req.key,
        ),
      );
    },
    async getRefund(paymentId, refundId) {
      const json = await call("GET", `/payments/${safeId(paymentId, "tr")}/refunds/${safeId(refundId, "re")}`);
      return json === null ? null : refund(json);
    },
    async listRefunds(paymentId) {
      const json = await call("GET", `/payments/${safeId(paymentId, "tr")}/refunds?limit=250`);
      const embedded = isObj(json) && isObj(json._embedded) && Array.isArray(json._embedded.refunds) ? json._embedded.refunds : [];
      return embedded.flatMap((x: unknown) => {
        const r = parseRefund(x);
        if (!r) return [];
        const meta = isObj(x) && isObj(x.metadata) ? x.metadata : {};
        return [{ ...r, refundId: typeof meta.refundId === "string" ? meta.refundId : null }];
      });
    },
  };
}

/**
 * Which of a methods list (GET /v2/methods) can take a payment. GEDOCUMENTEERD
 * (docs.mollie.com "List payment methods", 2026-10-12): live mode returns only
 * fully enabled methods, test mode also pending ones, each with a `status`
 * (activated, pending-boarding, pending-review, pending-external, rejected).
 */
export function parseActiveMethods(x: unknown): string[] | null {
  const list = isObj(x) && isObj(x._embedded) && Array.isArray(x._embedded.methods) ? x._embedded.methods : null;
  if (!list) return null;
  return list.flatMap((m: unknown) => (isObj(m) && typeof m.id === "string" && (m.status === undefined || m.status === null || m.status === "activated") ? [m.id] : []));
}

export type MethodsAnswer = { kind: "ok"; active: string[] } | { kind: "refused"; status: number } | { kind: "unreachable" };

/**
 * Asks Mollie which methods work right now: a key that is filled in is not a
 * till that works (docs/BEHEER.md). Never throws. Apple Pay is only listed
 * when asked for (`includeWallets`).
 */
export async function activeMethods(config: MollieConfig, fetchImpl: typeof fetch = fetch): Promise<MethodsAnswer> {
  try {
    const res = await fetchImpl(`${API}/methods?includeWallets=applepay`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 500) return { kind: "unreachable" };
    if (res.status >= 400) return { kind: "refused", status: res.status };
    const active = parseActiveMethods(await res.json().catch(() => null));
    return active ? { kind: "ok", active } : { kind: "unreachable" };
  } catch {
    return { kind: "unreachable" };
  }
}

let configured: PaymentProvider | null | undefined;

/** The shop's provider from MOLLIE_API_KEY; null when none is set. */
export function defaultProvider(): PaymentProvider | null {
  if (configured === undefined) {
    const config = parseMollieConfig(process.env);
    configured = config ? mollieProvider(config) : null;
  }
  return configured;
}
