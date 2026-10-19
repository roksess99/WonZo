// Side effects (mail, invoice, purchase) are written here in the same
// transaction as the status change, and carried out later, outside it
// (.claude/rules/geld.md § Bestellingen, docs/IDEMPOTENCY.md § Mail: at least
// once). One record per (kind, key): writing the same effect twice is one.
// Carried out: "supplier-order" (src/lib/orders/purchasing.ts). Still to come:
// mail (D-29) and invoice (D-15, D-21) — those stay PENDING until then.

import { toDbTime, type Connection } from "@/lib/db";

export type OutboxKind = "order-confirmation" | "admin-new-order" | "supplier-order" | "invoice" | "order-cancelled" | "order-shipped" | "admin-alert" | "return-requested" | "return-rejected" | "return-refunded" | "admin-new-return" | "review-invite";

export async function enqueue(conn: Connection, kind: OutboxKind | string, dedupeKey: string, payload: Record<string, unknown>, now: Date): Promise<void> {
  // A second write of the same effect is a no-op, not an error (retry-safe).
  await conn.query(
    `INSERT INTO outbox (kind, dedupe_key, payload, status, next_attempt_at, created_at)
     VALUES (?, ?, ?, 'PENDING', ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [kind, dedupeKey.slice(0, 100), JSON.stringify(payload), toDbTime(now), toDbTime(now)],
  );
}
