// HTTP client for the supplier (docs/api/LEVERANCIER.md). Server-side only:
// the token is a secret and the limits are shop-wide
// (.claude/rules/catalogus.md § Server-side, altijd). Read-only: this client
// refuses every order endpoint — ordering is fase 5, with its own rules.

import type { Connection } from "@/lib/db";
import { LIMITS, withinLimit } from "../sync/schedule";
import "./dto"; // its browser guard

export type SupplierConfig = { token: string; baseUrl: string };

/** Token and base URL from the environment; null = not configured (the shop then uses the mock). */
export function supplierConfig(env: Record<string, string | undefined> = process.env): SupplierConfig | null {
  const token = (env.SUPPLIER_API_TOKEN ?? "").trim();
  const baseUrl = (env.SUPPLIER_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!token || !baseUrl) return null;
  if (!/^https:\/\//.test(baseUrl)) throw new Error("SUPPLIER_BASE_URL must start with https://");
  return { token, baseUrl };
}

export class SupplierHttpError extends Error {
  constructor(
    readonly endpoint: string,
    readonly status: number | "timeout" | "network",
  ) {
    super(`Supplier ${endpoint}: ${status}`);
  }
}

/** Over the limit for now: try again on a later run. */
export class BudgetExhausted extends Error {
  constructor(readonly endpoint: string) {
    super(`Supplier limit reached for ${endpoint}`);
  }
}

async function callsInWindow(conn: Connection, endpoint: string): Promise<number> {
  const windowMs = LIMITS[endpoint]!.windowMs;
  const [rows] = await conn.query("SELECT COUNT(*) AS n FROM catalog_api_calls WHERE endpoint = ? AND called_at > NOW(3) - INTERVAL ? MICROSECOND", [
    endpoint,
    windowMs * 1000,
  ]);
  return Number((rows as { n: number }[])[0]?.n ?? 0);
}

export async function hasBudget(conn: Connection, endpoint: string): Promise<boolean> {
  return withinLimit(endpoint, await callsInWindow(conn, endpoint));
}

/**
 * GET a supplier path and return the parsed JSON. Counts against the limit
 * of `endpoint` before the call (a call that times out still counted at the
 * supplier). 404 returns null: the measured answer for "no data" on single
 * items (productcompliance).
 */
export async function supplierGet(conn: Connection, config: SupplierConfig, endpoint: string, path: string, timeoutMs = 120_000): Promise<unknown> {
  if (/\/order\//i.test(path)) throw new Error("Refused: the catalog client never calls an order endpoint");
  if (!(await hasBudget(conn, endpoint))) throw new BudgetExhausted(endpoint);
  const [inserted] = await conn.execute("INSERT INTO catalog_api_calls (endpoint) VALUES (?)", [endpoint]);
  const callId = (inserted as { insertId: number }).insertId;
  let status: number | "timeout" | "network" = "network";
  try {
    const res = await fetch(`${config.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    status = res.status;
    if (res.status === 404) return null;
    if (res.status === 429) throw new BudgetExhausted(endpoint);
    if (!res.ok) throw new SupplierHttpError(endpoint, res.status);
    // A 200 with an error body is an error (.claude/rules/catalogus.md § Schema aan de rand).
    const json: unknown = await res.json();
    if (json && typeof json === "object" && !Array.isArray(json) && "code" in json && "message" in json && !("id" in json)) {
      throw new SupplierHttpError(endpoint, Number((json as { code: unknown }).code) || 200);
    }
    return json;
  } catch (err) {
    if (err instanceof BudgetExhausted || err instanceof SupplierHttpError) throw err;
    status = err instanceof DOMException && err.name === "TimeoutError" ? "timeout" : "network";
    throw new SupplierHttpError(endpoint, status);
  } finally {
    await conn.execute("UPDATE catalog_api_calls SET http_status = ? WHERE id = ?", [typeof status === "number" ? status : null, callId]).catch(() => {});
  }
}
