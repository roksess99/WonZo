// The last outcome of a check on an outside service (db/migrations/
// 0004_service_checks.sql). A cache: losing it means measuring again.

import { fromDbTime, selectRows, toDbTime, type Queryable } from "./index";

export type StoredCheck = { state: string; detail: Record<string, unknown> | null; checkedAt: Date };

export async function readCheck(db: Queryable, service: string): Promise<StoredCheck | null> {
  const [row] = await selectRows<{ state: string; detail: unknown; checked_at: string }>(db, "SELECT state, detail, checked_at FROM service_checks WHERE service = ?", [service]);
  if (!row) return null;
  // GEMETEN 2026-10-10: mysql2 hands a JSON column over already parsed; a string is parsed here.
  const raw: unknown = typeof row.detail === "string" ? JSON.parse(row.detail) : row.detail;
  const detail = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  return { state: row.state, detail, checkedAt: fromDbTime(row.checked_at) };
}

export async function writeCheck(db: Queryable, service: string, state: string, detail: Record<string, unknown> | null, now: Date): Promise<void> {
  await db.query(
    `INSERT INTO service_checks (service, state, detail, checked_at) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE state = VALUES(state), detail = VALUES(detail), checked_at = VALUES(checked_at)`,
    [service, state.slice(0, 30), detail ? JSON.stringify(detail) : null, toDbTime(now)],
  );
}
