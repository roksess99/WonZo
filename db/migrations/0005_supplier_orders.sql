-- Wat: inkooporders bij de leverancier (fase 6, D-04: automatisch inkopen na
-- het annuleervenster) en hun statuslog (docs/STATE_MACHINES.md § Supplier
-- order, docs/DATAMODEL.md § SupplierOrder). Eén inkooporder per bestelling en
-- bron; de regels zijn de bevroren bestelregels van die bron.
-- `reference` gaat als eigen referentie (internalReference) mee naar de
-- leverancier: daarmee wordt een verloren antwoord teruggevonden, en daarmee
-- wordt na een weigering opnieuw geprobeerd (D-04: 24 uur, dezelfde referentie).
-- rollback: DROP TABLE supplier_order_events, supplier_orders. Leeg bij uitrol:
-- er wordt live nog niet afgerekend, en SUPPLIER_ORDERING staat uit.

CREATE TABLE IF NOT EXISTS supplier_orders (
  id CHAR(36) NOT NULL PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  source VARCHAR(20) NOT NULL,
  reference VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  -- Het nummer bij de leverancier, zodra die bevestigde.
  supplier_order_ref VARCHAR(40) NULL,
  -- De bevroren inkoopprijs van de regels (excl. btw en verzending, D-16).
  expected_cost_cents BIGINT NOT NULL,
  -- Wat de leverancier bij de controle vroeg: artikelen excl. btw en verzending, en alles samen.
  checked_products_cents BIGINT NULL,
  checked_total_cents BIGINT NULL,
  -- Meer dan 10 % duurder (D-04): wacht op de eigenaar; wie het daarna toch liet bestellen, en tot welk bedrag.
  blocked_reason VARCHAR(40) NULL,
  price_accepted_cents BIGINT NULL,
  price_accepted_by VARCHAR(60) NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  first_failed_at DATETIME(3) NULL,
  last_error VARCHAR(300) NULL,
  next_attempt_at DATETIME(3) NOT NULL,
  -- 24 uur geprobeerd zonder succes: de eigenaar kiest (D-04).
  gave_up_at DATETIME(3) NULL,
  placed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_order_source (order_id, source),
  UNIQUE KEY uq_source_reference (source, reference),
  KEY ix_status_due (status, next_attempt_at),
  CONSTRAINT fk_supplier_orders_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alleen toevoegen: elke statusovergang, in dezelfde transactie als de overgang.
CREATE TABLE IF NOT EXISTS supplier_order_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supplier_order_id CHAR(36) NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  actor VARCHAR(20) NOT NULL,
  reason VARCHAR(300) NULL,
  at DATETIME(3) NOT NULL,
  KEY ix_supplier_order (supplier_order_id, id),
  CONSTRAINT fk_supplier_order_events FOREIGN KEY (supplier_order_id) REFERENCES supplier_orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
