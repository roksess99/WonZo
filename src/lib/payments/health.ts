// Does paying work right now — not "is there a key" (docs/BEHEER.md § Een
// werkende sleutel is geen werkende kassa). Read by the admin dashboard and
// by the checkout page, which tells the customer before they fill anything
// in. Kept five minutes in service_checks; never throws. Server-side only.

import { getPool, hasDatabase } from "@/lib/db";
import { readCheck, writeCheck } from "@/lib/db/service-checks";
import { activeMethods, METHODS, parseMollieConfig, type MollieConfig } from "./mollie";

export type PaymentHealth =
  /** No MOLLIE_API_KEY: checking out cannot start. */
  | { state: "no-key" }
  /** MOLLIE_API_KEY is not a key, or a live key outside production. */
  | { state: "bad-config" }
  | { state: "refused"; status: number }
  | { state: "unreachable" }
  /** The key works, but not every method of D-05 can take a payment (e.g. "being verified"). */
  | { state: "methods-inactive"; testMode: boolean; inactive: string[]; active: string[] }
  | { state: "ok"; testMode: boolean };

const SERVICE = "mollie";
const KEEP_MS = 5 * 60_000;

/** The health from an answer of Mollie: pure, for the tests. */
export function healthFromAnswer(config: MollieConfig, answer: Awaited<ReturnType<typeof activeMethods>>): PaymentHealth {
  if (answer.kind === "refused") return { state: "refused", status: answer.status };
  if (answer.kind === "unreachable") return { state: "unreachable" };
  const ours = METHODS.filter((m) => answer.active.includes(m));
  const inactive = METHODS.filter((m) => !answer.active.includes(m));
  if (inactive.length) return { state: "methods-inactive", testMode: config.testMode, inactive, active: ours };
  return { state: "ok", testMode: config.testMode };
}

/** Whether a customer can pay with at least one method: only then the checkout form is shown. */
export function canTakePayments(h: PaymentHealth): boolean {
  return h.state === "ok" || (h.state === "methods-inactive" && h.active.length > 0);
}

function stored(state: string, detail: Record<string, unknown> | null): PaymentHealth | null {
  const list = (k: string) => (Array.isArray(detail?.[k]) ? (detail[k] as unknown[]).filter((x): x is string => typeof x === "string") : []);
  if (state === "ok") return { state, testMode: detail?.testMode === true };
  if (state === "methods-inactive") return { state, testMode: detail?.testMode === true, inactive: list("inactive"), active: list("active") };
  if (state === "refused") return { state, status: Number(detail?.status) || 0 };
  if (state === "unreachable") return { state };
  return null;
}

export async function paymentHealth(now: Date = new Date(), fetchImpl: typeof fetch = fetch): Promise<PaymentHealth> {
  let config: MollieConfig | null;
  try {
    config = parseMollieConfig(process.env);
  } catch {
    return { state: "bad-config" };
  }
  if (!config) return { state: "no-key" };
  if (hasDatabase) {
    const last = await readCheck(getPool(), SERVICE).catch(() => null);
    if (last && now.getTime() - last.checkedAt.getTime() < KEEP_MS) {
      const h = stored(last.state, last.detail);
      // A check made with the other key (test ↔ live) is not this one's answer.
      if (h && (!("testMode" in h) || h.testMode === config.testMode)) return h;
    }
  }
  const health = healthFromAnswer(config, await activeMethods(config, fetchImpl));
  if (hasDatabase) {
    const { state, ...detail } = health;
    await writeCheck(getPool(), SERVICE, state, detail, now).catch(() => {});
  }
  return health;
}
