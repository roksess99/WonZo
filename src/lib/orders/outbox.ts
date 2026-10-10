// Side effects (mail, invoice, purchase) are written here in the same
// transaction as the status change, and carried out later, outside it
// (.claude/rules/geld.md § Bestellingen, docs/IDEMPOTENCY.md § Mail: at least
// once). One record per (kind, key): writing the same effect twice is one.

import { toDbTime, type Connection } from "@/lib/db";

export type OutboxKind = "order-confirmation" | "admin-new-order" | "supplier-order" | "invoice" | "order-cancelled";

export async function enqueue(conn: Connection, kind: OutboxKind | string, dedupeKey: string, payload: Record<string, unknown>, now: Date): Promise<void> {
  // A second write of the same effect is a no-op, not an error (retry-safe).
  await conn.query(
    `INSERT INTO outbox (kind, dedupe_key, payload, status, next_attempt_at, created_at)
     VALUES (?, ?, ?, 'PENDING', ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [kind, dedupeKey.slice(0, 100), JSON.stringify(payload), toDbTime(now), toDbTime(now)],
  );
}

// TODO fase 5: de verwerker die openstaande records uitvoert (mail via de
// dienst van D-29, factuur na D-15 en de PDF-bibliotheek, inkoop bij BigBuy),
// met backoff en een alert na N pogingen.
