// The audit log: who did what, when — append only (docs/DATAMODEL.md § Admin,
// Session, AuditLog). Written in the same transaction as the change it
// describes, so a change without its line cannot exist.

import { fromDbTime, selectRows, toDbTime, type Connection, type Queryable } from "@/lib/db";

export type AuditEntry = {
  /** "customer", "system", or "admin:<id>" once the admin panel exists (D-07). */
  actor: string;
  action: string;
  objectType: string;
  objectId: string | number;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  requestId?: string | null;
};

export async function appendAudit(conn: Connection, entry: AuditEntry, now: Date): Promise<void> {
  await conn.query(
    `INSERT INTO audit_log (actor, action, object_type, object_id, before_state, after_state, reason, request_id, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.actor.slice(0, 60),
      entry.action.slice(0, 60),
      entry.objectType.slice(0, 30),
      String(entry.objectId).slice(0, 40),
      entry.before ? JSON.stringify(entry.before) : null,
      entry.after ? JSON.stringify(entry.after) : null,
      entry.reason?.slice(0, 200) ?? null,
      entry.requestId?.slice(0, 64) ?? null,
      toDbTime(now),
    ],
  );
}

export type AuditRow = {
  id: number;
  actor: string;
  action: string;
  objectType: string;
  objectId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  at: Date;
  /** The order's number when the object is an order: what the owner recognises. */
  orderReference: string | null;
};

export const AUDIT_PAGE_SIZE = 50;

const asObject = (x: unknown): Record<string, unknown> | null => {
  const v = typeof x === "string" ? (JSON.parse(x) as unknown) : x;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
};

/** One page of the log, newest first (docs/BEHEER.md § Beheerders: visible in the panel, not only in the database). */
export async function listAudit(db: Queryable, page: number): Promise<{ rows: AuditRow[]; total: number; pages: number; page: number }> {
  const [count] = await selectRows<{ n: number | string }>(db, "SELECT COUNT(*) AS n FROM audit_log");
  const total = Number(count?.n ?? 0);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const at = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const rows = await selectRows<Record<string, unknown>>(
    db,
    `SELECT a.id, a.actor, a.action, a.object_type, a.object_id, a.before_state, a.after_state, a.reason, a.at, o.reference
       FROM audit_log a LEFT JOIN orders o ON a.object_type = 'order' AND o.id = a.object_id
      ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    [AUDIT_PAGE_SIZE, (at - 1) * AUDIT_PAGE_SIZE],
  );
  return {
    rows: rows.map((r) => ({
      id: Number(r.id),
      actor: String(r.actor),
      action: String(r.action),
      objectType: String(r.object_type),
      objectId: String(r.object_id),
      before: asObject(r.before_state),
      after: asObject(r.after_state),
      reason: r.reason === null ? null : String(r.reason),
      at: fromDbTime(String(r.at)),
      orderReference: r.reference === null || r.reference === undefined ? null : String(r.reference),
    })),
    total,
    pages,
    page: at,
  };
}
