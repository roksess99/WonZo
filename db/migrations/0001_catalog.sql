-- Wat: de eigen kopie van de leverancierscatalogus (D-31, fase 3). Alleen
-- producten uit de toegestane subcategorieën (D-02), ook zonder voorraad;
-- "sellable" en "exclusion_reasons" zeggen of de winkel ze toont. Bedragen in
-- centen. Geen verkoopprijs: die rekent de winkel uit met de prijsregel (D-03).
-- Deze tabellen zijn de kopie van de adapter (src/lib/catalog/), opnieuw op te
-- halen bij de leverancier; geen bedrijfsstaat.
-- rollback: DROP TABLE van de tabellen hieronder; niets gaat verloren dat niet
-- opnieuw bij de leverancier is op te halen (de volgende nachtelijke ronde).

CREATE TABLE IF NOT EXISTS catalog_taxonomies (
  source VARCHAR(20) NOT NULL,
  id INT UNSIGNED NOT NULL,
  parent_id INT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (source, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS catalog_manufacturers (
  source VARCHAR(20) NOT NULL,
  id INT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (source, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS catalog_products (
  source VARCHAR(20) NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  sku VARCHAR(64) NOT NULL,
  ean VARCHAR(32) NULL,
  manufacturer_id INT UNSIGNED NULL,
  taxonomy_id INT UNSIGNED NOT NULL,
  -- Inkoopprijs: alleen voor de server (D-16), nooit naar de browser.
  cost_cents BIGINT NOT NULL,
  advised_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  tax_rate DECIMAL(5,2) NOT NULL,
  condition_code VARCHAR(40) NOT NULL,
  active TINYINT(1) NOT NULL,
  hs_code VARCHAR(20) NULL,
  added_at VARCHAR(30) NOT NULL,
  width DECIMAL(10,2) NULL,
  height DECIMAL(10,2) NULL,
  depth DECIMAL(10,2) NULL,
  weight DECIMAL(10,3) NULL,
  -- De laatste volledige ronde die dit product nog bij de leverancier zag.
  seen_run_id BIGINT UNSIGNED NULL,
  sellable TINYINT(1) NOT NULL DEFAULT 0,
  exclusion_reasons JSON NULL,
  evaluated_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (source, product_id),
  KEY ix_sku (source, sku),
  KEY ix_sellable (sellable)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS catalog_texts (
  source VARCHAR(20) NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  locale CHAR(2) NOT NULL,
  name VARCHAR(512) NOT NULL,
  description MEDIUMTEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (source, product_id, locale)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS catalog_stock (
  source VARCHAR(20) NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  warehouse INT NOT NULL,
  min_days INT NOT NULL,
  max_days INT NOT NULL,
  quantity INT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (source, product_id, warehouse, min_days, max_days)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS catalog_images (
  source VARCHAR(20) NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  image_id BIGINT UNSIGNED NOT NULL,
  position INT NOT NULL,
  is_cover TINYINT(1) NOT NULL,
  url VARCHAR(1024) NOT NULL,
  PRIMARY KEY (source, product_id, image_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- GPSR (D-34): fabrikant en waarschuwingen, in het Nederlands opgevraagd.
CREATE TABLE IF NOT EXISTS catalog_safety (
  source VARCHAR(20) NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  http_status INT NOT NULL,
  regulations JSON NULL,
  fetched_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (source, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verzendkosten per los product naar Nederland (D-13), per artikelnummer.
CREATE TABLE IF NOT EXISTS catalog_shipping (
  source VARCHAR(20) NOT NULL,
  sku VARCHAR(64) NOT NULL,
  cost_cents BIGINT NOT NULL,
  carrier VARCHAR(100) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (source, sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Een ronde verversen: "full" (nachtelijk) of "stock" (elke 2 uur).
CREATE TABLE IF NOT EXISTS catalog_sync_runs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(10) NOT NULL,
  status VARCHAR(10) NOT NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  detail TEXT NULL,
  KEY ix_kind_status (kind, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Voortgang binnen een ronde: per stap en groep de volgende pagina.
CREATE TABLE IF NOT EXISTS catalog_sync_progress (
  run_id BIGINT UNSIGNED NOT NULL,
  step VARCHAR(30) NOT NULL,
  group_id INT UNSIGNED NOT NULL,
  next_page INT NOT NULL DEFAULT 0,
  done TINYINT(1) NOT NULL DEFAULT 0,
  rows_seen INT NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (run_id, step, group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Elke aanroep bij de leverancier, voor de limieten per uur. Die gelden voor
-- de hele winkel, dus de telling staat in de database, niet in een proces
-- (.claude/rules/beveiliging.md § Rate limiting).
CREATE TABLE IF NOT EXISTS catalog_api_calls (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  endpoint VARCHAR(60) NOT NULL,
  http_status INT NULL,
  called_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_endpoint_time (endpoint, called_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
