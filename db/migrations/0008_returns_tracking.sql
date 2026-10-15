-- Wat: verzendstatus en retouren (fase 6, D-09, owner 2026-10-13).
-- Verzendstatus: wat BigBuy over de pakketten van een inkooporder meldt
-- (tracking), en wanneer een bestelling verzonden en afgeleverd is — de
-- herroepingstermijn loopt vanaf de aflevering (docs/RETOUREN.md).
-- Retouren: een aanvraag van de klant met per bestelregel een aantal en een
-- reden (docs/STATE_MACHINES.md § Return); één open retour per bestelling,
-- afgedwongen met een unieke sleutel op `open_order_id` (NULL zodra hij dicht
-- is). Het maximum dat terug kan, wordt bij de aanvraag berekend en bewaard.
-- Een terugbetaling en een creditnota weten bij welke retour ze horen.
-- Facturen: een bestelling kan nu meer creditnota's hebben (één per retour);
-- de unieke sleutel gaat van (order_id, kind) naar (order_id, doc_key):
-- 'invoice', 'cancel' of 'return:<id>'.
-- rollback: DROP TABLE return_events, return_lines, returns, shipments; de
-- kolommen hieronder blijven staan (alleen toevoegen) en zijn NULL voor oude
-- code. De oude sleutel uq_order_kind terugzetten kan zolang er per bestelling
-- hoogstens één creditnota is; live is dat zo bij uitrol (er wordt nog niet
-- afgerekend).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipped_at DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS delivered_at DATETIME(3) NULL;

ALTER TABLE supplier_orders
  ADD COLUMN IF NOT EXISTS shipped_at DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS delivered_at DATETIME(3) NULL,
  -- Wanneer de verzendstatus voor het laatst is opgevraagd (1 per seconde voor de hele winkel).
  ADD COLUMN IF NOT EXISTS tracking_checked_at DATETIME(3) NULL;

-- Eén rij per pakket dat de leverancier meldt; bijgewerkt bij elke opvraging.
CREATE TABLE IF NOT EXISTS shipments (
  supplier_order_id CHAR(36) NOT NULL,
  tracking_number VARCHAR(64) NOT NULL,
  carrier VARCHAR(60) NULL,
  -- De statustekst zoals de leverancier hem gaf (welke waarden er zijn is nog niet gemeten, vraag 25).
  status_text VARCHAR(120) NULL,
  status_at DATETIME(3) NULL,
  delivered TINYINT(1) NOT NULL DEFAULT 0,
  first_seen_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (supplier_order_id, tracking_number),
  CONSTRAINT fk_shipments_supplier_order FOREIGN KEY (supplier_order_id) REFERENCES supplier_orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS returns (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  -- Wat de klant ziet: R2026-00001, uit de teller (reeks "return").
  number VARCHAR(20) NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  -- Gelijk aan order_id zolang de retour open is, anders NULL: één open retour per bestelling.
  open_order_id BIGINT UNSIGNED NULL,
  status VARCHAR(20) NOT NULL,
  locale VARCHAR(5) NOT NULL,
  currency CHAR(3) NOT NULL,
  -- Bij de aanvraag berekend uit de bevroren regels (docs/RETOUREN.md): artikelen en verzendkosten, incl. btw.
  lines_cents BIGINT NOT NULL,
  shipping_cents BIGINT NOT NULL,
  -- Een opmerking van de klant (vrije tekst, docs/PRIVACY.md).
  customer_note VARCHAR(500) NULL,
  -- Wat de beheerder terugbetaalt: hoogstens lines + shipping; lager met een reden (waardevermindering).
  refund_cents BIGINT NULL,
  deduction_reason VARCHAR(200) NULL,
  refund_id CHAR(36) NULL,
  reject_reason VARCHAR(200) NULL,
  requested_at DATETIME(3) NOT NULL,
  received_at DATETIME(3) NULL,
  closed_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_number (number),
  UNIQUE KEY uq_open_order (open_order_id),
  KEY ix_order (order_id),
  KEY ix_status (status, requested_at),
  CONSTRAINT fk_returns_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS return_lines (
  return_id BIGINT UNSIGNED NOT NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  -- none (herroeping zonder reden), wrong (verkeerd geleverd), damaged, defect.
  reason VARCHAR(20) NOT NULL,
  PRIMARY KEY (return_id, line_no),
  CONSTRAINT fk_return_lines_return FOREIGN KEY (return_id) REFERENCES returns (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alleen toevoegen: elke statusovergang, in dezelfde transactie als de overgang.
CREATE TABLE IF NOT EXISTS return_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  return_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  actor VARCHAR(20) NOT NULL,
  reason VARCHAR(200) NULL,
  at DATETIME(3) NOT NULL,
  KEY ix_return (return_id, id),
  CONSTRAINT fk_return_events_return FOREIGN KEY (return_id) REFERENCES returns (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS return_id BIGINT UNSIGNED NULL;
ALTER TABLE refunds ADD KEY IF NOT EXISTS ix_return (return_id);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS return_id BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS doc_key VARCHAR(40) NULL;
UPDATE invoices SET doc_key = IF(kind = 'invoice', 'invoice', 'cancel') WHERE doc_key IS NULL;
ALTER TABLE invoices MODIFY doc_key VARCHAR(40) NOT NULL;
ALTER TABLE invoices ADD UNIQUE KEY IF NOT EXISTS uq_order_doc (order_id, doc_key);
ALTER TABLE invoices DROP INDEX IF EXISTS uq_order_kind;
