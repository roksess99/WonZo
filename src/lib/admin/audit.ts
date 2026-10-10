// The audit log: who did what, when — append only (docs/DATAMODEL.md § Admin,
// Session, AuditLog). Written in the same transaction as the change it
// describes, so a change without its line cannot exist.

import { toDbTime, type Connection } from "@/lib/db";

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
