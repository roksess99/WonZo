-- Wat: een eigen inleiding per artikel, in het Nederlands en het Engels
-- (gebruiker 2026-11-27, na de SEO-audit: de productteksten zijn letterlijk
-- die van de leverancier, en staan zo bij elke andere winkel).
--
-- product_texts: wat de eigenaar zelf over een artikel schrijft, gekoppeld
-- op bron en artikel-id zoals de catalogus ze kent. Een eigen tabel, niet in
-- de catalogustabellen: die worden elke nacht opnieuw gevuld (D-31) en zijn
-- opnieuw op te halen; deze tekst niet. Een lege tekst ('') is "geen
-- inleiding". version gaat bij elke opslag omhoog: twee schermen tegelijk
-- overschrijven elkaar niet stil. Elke wijziging komt in audit_log.
-- rollback: DROP TABLE product_texts; (de teksten gaan dan verloren — ze
-- staan ook in audit_log, bij 'product.text-changed')

CREATE TABLE IF NOT EXISTS product_texts (
  source VARCHAR(20) NOT NULL,
  product_id VARCHAR(20) NOT NULL,
  intro_nl VARCHAR(600) NOT NULL,
  intro_en VARCHAR(600) NOT NULL,
  version INT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  updated_by VARCHAR(60) NOT NULL,
  PRIMARY KEY (source, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
