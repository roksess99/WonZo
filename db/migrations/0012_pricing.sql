-- Wat: prijsregels, kortingsacties en prijsgeschiedenis (D-03, D-08, D-16;
-- antwoorden gebruiker 2026-11-02, docs/PRIJZEN.md).
--
-- price_settings: één rij (id = 1) met de standaardopslag (NULL = geen
-- prijsregel: de adviesprijs) en de betaalkosten per stuk (D-16), plus een
-- versienummer dat bij elke wijziging aan regels of acties omhoog gaat: de
-- winkel ziet daaraan dat hij opnieuw moet rekenen. price_markups: een
-- afwijkende opslag per subcategorie ("categorie/subcategorie").
-- promotions: een actie op een categorie, subcategorie of artikel, met
-- percentage en looptijd. Stoppen is niet weggooien: een gestopte actie houdt
-- haar rij, met een einde in het verleden (docs/PRIJZEN.md § 2).
-- price_history: onze verkoopprijs per artikel, een rij per wijziging, met de
-- regel of actie die hem gaf — nodig voor de "van"-prijs over 30 dagen
-- (WETTELIJK, docs/PRIJZEN.md § 2) en als bewijs achteraf.
-- order_lines: de prijs vóór de actie en de actie zelf, bevroren in de
-- bestelregel ("bewaar wat de klant zag", .claude/rules/geld.md).
-- rollback: DROP TABLE price_history, promotions, price_markups,
-- price_settings; ALTER TABLE order_lines DROP COLUMN list_price_cents, DROP
-- COLUMN promotion_id; (leeg bij uitrol: er wordt live nog niet verkocht)

CREATE TABLE IF NOT EXISTS price_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  default_markup_bp INT UNSIGNED NULL,
  payment_cost_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NULL,
  updated_by VARCHAR(60) NULL,
  CONSTRAINT ck_price_settings_one CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO price_settings (id, default_markup_bp, payment_cost_cents, version) VALUES (1, NULL, 0, 0);

CREATE TABLE IF NOT EXISTS price_markups (
  rule_key VARCHAR(80) NOT NULL PRIMARY KEY,
  markup_bp INT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  updated_by VARCHAR(60) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promotions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  -- 'category', 'subcategory' of 'product'.
  target_kind VARCHAR(12) NOT NULL,
  -- De categorie, "categorie/subcategorie", of het id van het artikel.
  target_key VARCHAR(80) NOT NULL,
  percent_bp INT UNSIGNED NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  created_by VARCHAR(60) NOT NULL,
  stopped_at DATETIME(3) NULL,
  stopped_by VARCHAR(60) NULL,
  KEY ix_promotions_time (ends_at, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS price_history (
  source VARCHAR(20) NOT NULL,
  product_id VARCHAR(20) NOT NULL,
  from_at DATETIME(3) NOT NULL,
  -- Wat de klant betaalde, en de prijs vóór een actie.
  price_cents BIGINT NOT NULL,
  list_price_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  -- 'markup' of 'advised'; de actie als die meedeed.
  basis VARCHAR(10) NOT NULL,
  promotion_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (source, product_id, from_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS list_price_cents BIGINT NULL AFTER unit_price_cents;
ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS promotion_id BIGINT UNSIGNED NULL AFTER list_price_cents;
