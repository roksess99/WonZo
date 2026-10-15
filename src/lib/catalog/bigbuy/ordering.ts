// Ordering at BigBuy (docs/api/LEVERANCIER.md § 10). The only file that
// knows BigBuy's order API. GEDOCUMENTEERD (doc.json, consulted 2026-10-12):
// POST /rest/order/check simulates and returns totals as numbers;
// POST /rest/order/create places (201, the id in the Location header or as
// `order_id`); GET /rest/order/reference/{ref} finds an order by our own
// `internalReference`; POST /rest/tracking/orders gives the parcels of orders
// (read only). 1 call per second for each. Still to measure: what a
// too-low balance returns, whether a second order with the same reference is
// refused (409?), and whether `carriers` may be left out (AANNAME: yes, BigBuy
// then picks one). Server-side only.

import { getPool } from "@/lib/db";
import { fromDecimal, type Money } from "@/lib/money";
import type { CheckAnswer, LookupAnswer, OrderingMode, Parcel, PlaceAnswer, SupplierOrdering, SupplierOrderRequest, TrackingAnswer } from "../ordering";
import { hasBudget, supplierConfig, type SupplierConfig } from "./client";

if (typeof window !== "undefined") throw new Error("Ordering at the supplier must not run in the browser");

const SANDBOX_HOST = "api.sandbox.bigbuy.eu";
const LIVE_HOST = "api.bigbuy.eu";
/** The order calls share one budget: 1 a second (GEDOCUMENTEERD), counted in catalog_api_calls. */
const ENDPOINT = "order";
/** tracking/* has a limit of its own: also 1 a second (GEDOCUMENTEERD). */
const TRACKING = "tracking";
const TIMEOUT_MS = 30_000;

/**
 * SUPPLIER_ORDERING: "off" (or empty) orders nothing. "sandbox" only against
 * BigBuy's sandbox; "live" only in production and only against BigBuy's live
 * address. Anything else stops the shop at start: a real order by mistake is
 * the one error that costs money each time (CLAUDE.md § Absolute invarianten).
 */
export function orderingMode(env: Record<string, string | undefined>): OrderingMode {
  const v = (env.SUPPLIER_ORDERING ?? "").trim() || "off";
  if (v !== "off" && v !== "sandbox" && v !== "live") throw new Error(`SUPPLIER_ORDERING must be "off", "sandbox" or "live" (got ${JSON.stringify(v)}).`);
  if (v === "off") return "off";
  const config = supplierConfig(env);
  if (!config) throw new Error("SUPPLIER_ORDERING needs SUPPLIER_API_TOKEN and SUPPLIER_BASE_URL.");
  const host = new URL(config.baseUrl).hostname;
  if (v === "sandbox" && host !== SANDBOX_HOST) throw new Error(`SUPPLIER_ORDERING=sandbox needs SUPPLIER_BASE_URL on ${SANDBOX_HOST}.`);
  if (v === "live" && host !== LIVE_HOST) throw new Error(`SUPPLIER_ORDERING=live needs SUPPLIER_BASE_URL on ${LIVE_HOST}.`);
  if (v === "live" && env.NODE_ENV !== "production") throw new Error("SUPPLIER_ORDERING=live is refused outside production: real orders only from the live shop.");
  return v;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** A BigBuy amount (a JSON number like 18.22, or a string): exactly to cents, never via a float multiplication. */
export function parseAmount(x: unknown): Money | null {
  if (typeof x !== "number" && typeof x !== "string") return null;
  try {
    const m = fromDecimal(x);
    return m.amount >= 0 ? m : null;
  } catch {
    return null;
  }
}

/** The order body, as doc.json describes `CustomerOrderProcess`. Payment only from the balance (D-04). */
export function orderBody(req: SupplierOrderRequest): unknown {
  const a = req.address;
  return {
    order: {
      internalReference: req.reference,
      language: req.language,
      paymentMethod: "moneybox",
      shippingAddress: {
        firstName: a.firstName,
        lastName: a.lastName,
        country: a.country,
        // "1234 AB" is stored with a space (src/lib/orders/customer.ts); BigBuy's own examples have none (AANNAME).
        postcode: a.postcode.replace(/\s+/g, ""),
        town: a.city,
        address: `${a.street} ${a.houseNumber}`,
        phone: a.phone,
        email: a.email,
      },
      products: req.lines.map((l) => ({ reference: l.sku, quantity: l.quantity })),
    },
  };
}

export function parseCheck(x: unknown): CheckAnswer {
  if (!isObj(x)) return { kind: "unknown" };
  const products = parseAmount(x.totalWithoutTaxesAndWithoutShippingCost);
  const total = parseAmount(x.total);
  return products && total ? { kind: "ok", products, total } : { kind: "unknown" };
}

/** The created order's id: from the Location header (".../order/123"), else from the body. */
export function createdId(location: string | null, body: unknown): string | null {
  const fromHeader = location ? /(\d{1,20})(?:\.json)?\/?$/.exec(location)?.[1] : undefined;
  if (fromHeader) return fromHeader;
  const fromBody = isObj(body) ? body.order_id ?? body.id : undefined;
  return typeof fromBody === "number" || (typeof fromBody === "string" && /^\d{1,20}$/.test(fromBody)) ? String(fromBody) : null;
}

const messageOf = (x: unknown) => (isObj(x) && typeof x.message === "string" ? x.message.slice(0, 200) : "");

type Raw = { status: number | "timeout" | "network"; json: unknown; location: string | null };

async function call(config: SupplierConfig, method: "GET" | "POST", path: string, body?: unknown, endpoint = ENDPOINT): Promise<Raw | "no-budget"> {
  const pool = getPool();
  // 1 a second: wait for the slot a little, instead of failing the run.
  for (let i = 0; !(await hasBudget(pool, endpoint)); i++) {
    if (i >= 3) return "no-budget";
    await new Promise((r) => setTimeout(r, 1_100));
  }
  const [inserted] = await pool.execute("INSERT INTO catalog_api_calls (endpoint) VALUES (?)", [endpoint]);
  const callId = (inserted as { insertId: number }).insertId;
  let raw: Raw = { status: "network", json: null, location: null };
  try {
    const res = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
    raw = { status: res.status, json: await res.json().catch(() => null), location: res.headers.get("location") };
  } catch (err) {
    raw = { status: err instanceof DOMException && err.name === "TimeoutError" ? "timeout" : "network", json: null, location: null };
  } finally {
    await pool.execute("UPDATE catalog_api_calls SET http_status = ? WHERE id = ?", [typeof raw.status === "number" ? raw.status : null, callId]).catch(() => {});
  }
  return raw;
}

/** What a placing call's answer means. Pure, for the tests. */
export function placeAnswer(raw: Raw): PlaceAnswer {
  if (raw.status === 201 || raw.status === 200) {
    const id = createdId(raw.location, raw.json);
    // Created, but no id we can read: ask by the reference instead of guessing.
    return id ? { kind: "placed", supplierOrderRef: id } : { kind: "unknown" };
  }
  // 409 "constrain conflicts" may be our reference already being there (not measured);
  // 429 and 5xx: not known what happened. Asking by the reference settles all three.
  if (typeof raw.status !== "number" || raw.status === 409 || raw.status === 429 || raw.status >= 500) return { kind: "unknown" };
  return { kind: "refused", status: raw.status, message: messageOf(raw.json) };
}

export function lookupAnswer(raw: Raw): LookupAnswer {
  if (raw.status === 200 && isObj(raw.json) && (typeof raw.json.id === "string" || typeof raw.json.id === "number")) return { kind: "found", supplierOrderRef: String(raw.json.id) };
  // GEMETEN 2026-10-05: production answers 404 for an unknown reference, the sandbox 500 —
  // so only a 404 proves that nothing arrived.
  if (raw.status === 404) return { kind: "absent" };
  return { kind: "unknown" };
}

/**
 * BigBuy's "2016-05-13 11:35:40" (doc.json example). Which time zone is not
 * documented: read as UTC (AANNAME). Spain is one or two hours ahead, so a
 * delivery reads up to two hours later — the withdrawal window then ends a
 * little later, never earlier.
 */
export function parseSupplierTime(x: unknown): Date | null {
  if (typeof x !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(x);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Whether BigBuy's status says the parcel arrived. GEDOCUMENTEERD only as
 * the example "delivered" (doc.json, TrackingDoc); which other values exist,
 * and in which language, is not measured (docs/api/VRAGEN.md vraag 25). So
 * only that word counts (AANNAME); anything else is "on the way", and the
 * admin can mark an order delivered by hand.
 */
export const isDeliveredStatus = (s: string | null) => s !== null && s.trim().toLowerCase() === "delivered";

/**
 * The answer of POST /rest/tracking/orders (doc.json, OrderTrackingDoc):
 * [{ id, reference, trackings: [{ trackingNumber, statusDescription,
 * statusDate, carrier: { id } }] }]. A parcel without a tracking number is
 * not a parcel we can tell anyone about: left out.
 */
export function parseTracking(x: unknown, carrierNames: ReadonlyMap<string, string>): TrackingAnswer {
  if (!Array.isArray(x)) return { kind: "unknown" };
  const orders: { supplierOrderRef: string; parcels: Parcel[] }[] = [];
  for (const o of x) {
    if (!isObj(o) || (typeof o.id !== "number" && typeof o.id !== "string")) continue;
    const parcels: Parcel[] = [];
    for (const t of Array.isArray(o.trackings) ? o.trackings : []) {
      if (!isObj(t) || typeof t.trackingNumber !== "string" || !/^[A-Za-z0-9 ._/-]{3,64}$/.test(t.trackingNumber.trim())) continue;
      const carrierId = isObj(t.carrier) && (typeof t.carrier.id === "string" || typeof t.carrier.id === "number") ? String(t.carrier.id) : null;
      const statusText = typeof t.statusDescription === "string" ? t.statusDescription.trim().slice(0, 120) || null : null;
      parcels.push({
        trackingNumber: t.trackingNumber.trim(),
        carrier: carrierId ? (carrierNames.get(carrierId) ?? null) : null,
        statusText,
        statusAt: parseSupplierTime(t.statusDate),
        delivered: isDeliveredStatus(statusText),
      });
    }
    orders.push({ supplierOrderRef: String(o.id), parcels });
  }
  return { kind: "ok", orders };
}

/** GET /rest/tracking/carriers (doc.json, CarrierTrackingDoc): [{ id, name }]. */
export function parseCarriers(x: unknown): Map<string, string> {
  const names = new Map<string, string>();
  for (const c of Array.isArray(x) ? x : []) {
    if (isObj(c) && (typeof c.id === "string" || typeof c.id === "number") && typeof c.name === "string" && c.name.trim()) names.set(String(c.id), c.name.trim().slice(0, 60));
  }
  return names;
}

/** Carrier names change rarely: asked at most once a day per process — a cache, nothing that cannot be asked again. */
let carriers: { names: Map<string, string>; at: number } | null = null;

const safeReference = (ref: string) => {
  if (!/^[A-Za-z0-9-]{1,40}$/.test(ref)) throw new Error(`Not a reference: ${ref}`);
  return ref;
};

export function bigbuyOrdering(env: Record<string, string | undefined>): SupplierOrdering | null {
  const mode = orderingMode(env);
  if (mode === "off") return null;
  const config = supplierConfig(env)!;
  return {
    source: "bigbuy",
    mode,
    async check(req) {
      const raw = await call(config, "POST", "/rest/order/check.json", orderBody(req));
      if (raw === "no-budget") return { kind: "unknown" };
      if (raw.status === 200) return parseCheck(raw.json);
      if (typeof raw.status !== "number" || raw.status === 429 || raw.status >= 500) return { kind: "unknown" };
      return { kind: "refused", status: raw.status, message: messageOf(raw.json) };
    },
    async place(req) {
      const raw = await call(config, "POST", "/rest/order/create.json", orderBody(req));
      // Not sent at all: nothing can have arrived, but UNKNOWN costs only a lookup and is never wrong.
      return raw === "no-budget" ? { kind: "unknown" } : placeAnswer(raw);
    },
    async lookup(reference) {
      const raw = await call(config, "GET", `/rest/order/reference/${encodeURIComponent(safeReference(reference))}.json`);
      return raw === "no-budget" ? { kind: "unknown" } : lookupAnswer(raw);
    },
    async tracking(refs) {
      const ids = refs.filter((r) => /^\d{1,20}$/.test(r));
      if (!ids.length) return { kind: "ok", orders: [] };
      if (!carriers || Date.now() - carriers.at > 24 * 3_600_000) {
        const raw = await call(config, "GET", "/rest/tracking/carriers.json", undefined, TRACKING);
        // Without names the parcels still count; the names are tried again next time.
        if (raw !== "no-budget" && raw.status === 200) carriers = { names: parseCarriers(raw.json), at: Date.now() };
      }
      const raw = await call(config, "POST", "/rest/tracking/orders.json?isoCode=en", { track: { orders: ids.map((id) => ({ id })) } }, TRACKING);
      if (raw === "no-budget") return { kind: "unknown" };
      // 404 "No carriers found": nothing has left yet (GEDOCUMENTEERD).
      if (raw.status === 404) return { kind: "ok", orders: [] };
      return raw.status === 200 ? parseTracking(raw.json, carriers?.names ?? new Map()) : { kind: "unknown" };
    },
  };
}
