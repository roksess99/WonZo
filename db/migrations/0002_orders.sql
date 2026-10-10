-- Wat: bestellingen (fase 4). Een bestelling met haar bevroren regels, het
-- statuslog, de toegangssleutels voor de statuslink, de outbox voor
-- neveneffecten, het auditlog en de tellers voor order- en factuurnummers
-- (docs/DATAMODEL.md, docs/STATE_MACHINES.md, docs/IDEMPOTENCY.md).
-- Bedragen in centen; één valuta per bestelling (D-14). Btw-bedragen staan er
-- nog niet in: die volgen uit de rekenwijze van D-15 en komen er met een
-- latere migratie bij; het tarief per regel wordt wel bevroren.
-- rollback: DROP TABLE van de tabellen hieronder. Leeg bij uitrol: er wordt
-- nog niet afgerekend (betalen komt in fase 5), dus er gaat niets verloren.

CREATE TABLE IF NOT EXISTS counters (
  series VARCHAR(20) NOT NULL,
  period SMALLINT UNSIGNED NOT NULL,
  last_value INT UNSIGNED NOT NULL,
  PRIMARY KEY (series, period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  -- Wat de klant ziet: WZ-2026-00001 (eigenaar, 2026-10-10). Mag raadbaar zijn;
  -- toegang gaat via order_access_tokens.
  reference VARCHAR(20) NOT NULL,
  -- Idempotentiesleutel van de checkout-poging, en een hash van wat er gevraagd
  -- werd: dezelfde sleutel met een andere inhoud wordt geweigerd.
  checkout_attempt_id CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status VARCHAR(30) NOT NULL,
  hold_reason VARCHAR(40) NULL,
  locale VARCHAR(5) NOT NULL,
  currency CHAR(3) NOT NULL,
  -- Klantgegevens (docs/PRIVACY.md): nodig voor levering en administratie.
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  street VARCHAR(200) NOT NULL,
  house_number VARCHAR(20) NOT NULL,
  postcode VARCHAR(10) NOT NULL,
  city VARCHAR(100) NOT NULL,
  country CHAR(2) NOT NULL,
  -- Bevroren bedragen, incl. btw.
  subtotal_cents BIGINT NOT NULL,
  shipping_standard_cents BIGINT NOT NULL,
  shipping_large_cents BIGINT NOT NULL,
  total_cents BIGINT NOT NULL,
  -- Tot wanneer de bevroren bedragen betaald mogen worden (eigenaar, 2026-10-10: 60 minuten).
  snapshot_expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  paid_at DATETIME(3) NULL,
  -- Einde van het annuleervenster (D-04: 30 minuten na de betaling), vastgelegd
  -- bij de betaling zodat een latere wijziging van het beleid oude orders niet raakt.
  cancel_window_ends_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_reference (reference),
  UNIQUE KEY uq_checkout_attempt (checkout_attempt_id),
  KEY ix_status_window (status, cancel_window_ends_at),
  KEY ix_status_expires (status, snapshot_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_lines (
  order_id BIGINT UNSIGNED NOT NULL,
  line_no SMALLINT UNSIGNED NOT NULL,
  source VARCHAR(20) NOT NULL,
  product_id VARCHAR(20) NOT NULL,
  -- De aanbieding waarmee gerekend is: daar wordt ingekocht (.claude/rules/geld.md).
  offer_id VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  brand VARCHAR(255) NULL,
  sku VARCHAR(64) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price_cents BIGINT NOT NULL,
  line_total_cents BIGINT NOT NULL,
  vat_rate_bp INT UNSIGNED NOT NULL,
  -- Eigen verzendkosten per stuk bij een groot artikel (D-13); NULL voor een gewoon artikel.
  large_shipping_cents BIGINT NULL,
  -- Inkoopprijs op het moment van bestellen (D-16: landedCost = supplierCost tot die beslissing).
  supplier_cost_cents BIGINT NOT NULL,
  supplier_cost_currency CHAR(3) NOT NULL,
  min_days SMALLINT UNSIGNED NOT NULL,
  max_days SMALLINT UNSIGNED NOT NULL,
  ships_from VARCHAR(40) NOT NULL,
  PRIMARY KEY (order_id, line_no),
  CONSTRAINT fk_order_lines_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alleen toevoegen: elke statusovergang, in dezelfde transactie als de overgang.
CREATE TABLE IF NOT EXISTS order_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(30) NULL,
  to_status VARCHAR(30) NOT NULL,
  actor VARCHAR(20) NOT NULL,
  reason VARCHAR(200) NULL,
  at DATETIME(3) NOT NULL,
  KEY ix_order (order_id, id),
  CONSTRAINT fk_order_events_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- De sleutel in de statuslink, alleen als hash. Per bericht een eigen sleutel,
-- zodat het token zelf nergens bewaard hoeft te worden.
CREATE TABLE IF NOT EXISTS order_access_tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  KEY ix_order (order_id),
  CONSTRAINT fk_order_tokens_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Neveneffecten (mail, factuur, inkoop), geschreven in dezelfde transactie als
-- de overgang en daarna los verwerkt; één per (soort, sleutel).
CREATE TABLE IF NOT EXISTS outbox (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(40) NOT NULL,
  dedupe_key VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  status VARCHAR(20) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3) NOT NULL,
  sent_at DATETIME(3) NULL,
  last_error VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_kind_key (kind, dedupe_key),
  KEY ix_due (status, next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alleen toevoegen: wie deed wat wanneer.
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor VARCHAR(60) NOT NULL,
  action VARCHAR(60) NOT NULL,
  object_type VARCHAR(30) NOT NULL,
  object_id VARCHAR(40) NOT NULL,
  before_state JSON NULL,
  after_state JSON NULL,
  reason VARCHAR(200) NULL,
  request_id VARCHAR(64) NULL,
  at DATETIME(3) NOT NULL,
  KEY ix_object (object_type, object_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
