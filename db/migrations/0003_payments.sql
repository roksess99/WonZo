-- Wat: betalingen en terugbetalingen bij de betaaldienst (fase 5, D-05:
-- Mollie), hun statuslog, de verwerkte meldingen van de betaaldienst en een
-- teller voor de rate limit op afrekenen (docs/DATAMODEL.md § Payment,
-- Refund, ProviderEvent; docs/PAYMENTS.md).
-- Een betaling bestaat lokaal vóór de betaaldienst hem kent: het id is de
-- idempotentiesleutel (docs/IDEMPOTENCY.md § Payment aanmaken).
-- rollback: DROP TABLE van de tabellen hieronder. Leeg bij uitrol: afrekenen
-- staat live uit (CHECKOUT_ENABLED), dus er gaat niets verloren.

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  provider_payment_id VARCHAR(40) NULL,
  method VARCHAR(30) NULL,
  -- De betaalpagina van de betaaldienst; alleen een adres van die dienst.
  checkout_url VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL,
  paid_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_provider_payment (provider, provider_payment_id),
  KEY ix_order (order_id),
  KEY ix_status (status, updated_at),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id CHAR(36) NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  actor VARCHAR(20) NOT NULL,
  reason VARCHAR(200) NULL,
  at DATETIME(3) NOT NULL,
  KEY ix_payment (payment_id, id),
  CONSTRAINT fk_payment_events_payment FOREIGN KEY (payment_id) REFERENCES payments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refunds (
  id CHAR(36) NOT NULL PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  payment_id CHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  reason VARCHAR(200) NOT NULL,
  requested_by VARCHAR(60) NOT NULL,
  provider_refund_id VARCHAR(40) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_provider_refund (provider_refund_id),
  KEY ix_order (order_id),
  KEY ix_status (status, updated_at),
  CONSTRAINT fk_refunds_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT fk_refunds_payment FOREIGN KEY (payment_id) REFERENCES payments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refund_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  refund_id CHAR(36) NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  actor VARCHAR(20) NOT NULL,
  reason VARCHAR(200) NULL,
  at DATETIME(3) NOT NULL,
  KEY ix_refund (refund_id, id),
  CONSTRAINT fk_refund_events_refund FOREIGN KEY (refund_id) REFERENCES refunds (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Elke melding van de betaaldienst, één keer verwerkt per (betaling, stand):
-- Mollie stuurt alleen een id en geen event-id, dus de sleutel is het id plus
-- de stand die we daarna zelf opvroegen.
CREATE TABLE IF NOT EXISTS provider_events (
  provider VARCHAR(20) NOT NULL,
  event_key VARCHAR(120) NOT NULL,
  resource_id VARCHAR(40) NOT NULL,
  received_at DATETIME(3) NOT NULL,
  PRIMARY KEY (provider, event_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rate limit voor afrekenen (.claude/rules/beveiliging.md § Webverzoeken), in
-- de database zodat hij voor alle processen samen geldt. De sleutel bevat
-- een hash van het IP-adres, niet het adres zelf.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket VARCHAR(80) NOT NULL,
  window_start DATETIME(3) NOT NULL,
  hits INT UNSIGNED NOT NULL,
  PRIMARY KEY (bucket, window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
