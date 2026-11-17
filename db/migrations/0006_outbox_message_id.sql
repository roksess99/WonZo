-- Wat: het kenmerk dat de mailserver teruggeeft bij een verzonden mail (fase 6,
-- D-29, docs/IDEMPOTENCY.md § Mail): daarmee is een mail bij Hostinger terug
-- te vinden als een klant zegt dat hij niets kreeg. Alleen toevoegen.
-- rollback: ALTER TABLE outbox DROP COLUMN message_id. Er gaat alleen het
-- kenmerk verloren, de mail zelf niet.

ALTER TABLE outbox ADD COLUMN IF NOT EXISTS message_id VARCHAR(200) NULL;
