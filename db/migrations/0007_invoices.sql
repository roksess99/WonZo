-- Wat: facturen en creditnota's (fase 6, D-21, docs/FACTUUR.md). Het nummer
-- komt uit de teller (`counters`, reeks "invoice" of "credit" per jaar) in
-- dezelfde transactie als de factuur: zonder gaten, nooit hergebruikt. De PDF
-- wordt bij het maken opgeslagen (eigenaar, D-21) en nooit meer gewijzigd; een
-- annulering na facturering krijgt een creditnota met een eigen nummer.
-- `snapshot` is wat er op het document staat (de bevroren bestelling op dat
-- moment); de btw per tarief staat apart voor het maandoverzicht.
-- Bewaren: 7 jaar (`WETTELIJK`, art. 52 AWR, te bevestigen) — de PDF is
-- bedrijfsdata en hoort in de backup (docs/DISASTER_RECOVERY.md).
-- rollback: DROP TABLE invoice_vat, invoices. Leeg bij uitrol: er wordt live
-- nog niet afgerekend.

CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(20) NOT NULL,
  kind VARCHAR(10) NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  -- Bij een creditnota: de factuur waar hij bij hoort.
  credits_invoice_id BIGINT UNSIGNED NULL,
  issued_at DATETIME(3) NOT NULL,
  currency CHAR(3) NOT NULL,
  total_excl_cents BIGINT NOT NULL,
  total_vat_cents BIGINT NOT NULL,
  total_incl_cents BIGINT NOT NULL,
  snapshot JSON NOT NULL,
  pdf MEDIUMBLOB NOT NULL,
  pdf_sha256 CHAR(64) NOT NULL,
  UNIQUE KEY uq_number (number),
  -- Eén factuur en hoogstens één creditnota per bestelling (een volledige annulering).
  UNIQUE KEY uq_order_kind (order_id, kind),
  KEY ix_issued (issued_at),
  CONSTRAINT fk_invoices_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT fk_invoices_credits FOREIGN KEY (credits_invoice_id) REFERENCES invoices (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoice_vat (
  invoice_id BIGINT UNSIGNED NOT NULL,
  vat_rate_bp INT UNSIGNED NOT NULL,
  base_cents BIGINT NOT NULL,
  vat_cents BIGINT NOT NULL,
  PRIMARY KEY (invoice_id, vat_rate_bp),
  CONSTRAINT fk_invoice_vat FOREIGN KEY (invoice_id) REFERENCES invoices (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
