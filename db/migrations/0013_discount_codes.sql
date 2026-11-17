-- Wat: kortingscodes (D-08, D-15; antwoorden gebruiker 2026-11-02,
-- docs/PRIJZEN.md § 3).
--
-- discount_codes: een code met percentage, minimumbedrag (over de artikelen,
-- incl. btw), looptijd en een optioneel maximum aantal keer. De code staat in
-- hoofdletters en is uniek. Stoppen is niet weggooien: het einde wordt "nu",
-- de rij blijft (zoals bij acties).
-- discount_redemptions: het gebruik, pas geschreven als de bestelling
-- betaald is ("afgetekend na de betaling"). "Eén keer per klant" is de unieke
-- sleutel (code, hash van het mailadres): de database beslist, niet een
-- controle in code. Het mailadres zelf staat er niet in, alleen de hash.
-- orders: welke code, de tekst zoals die gold, en wat hij eraf haalde.
-- order_lines: het aandeel van de code per regel (D-15), nodig voor de btw en
-- een gedeeltelijk retour. return_lines: het aandeel van de code in de
-- teruggestuurde stuks, vastgelegd bij het aanmelden.
-- rollback: DROP TABLE discount_redemptions, discount_codes; ALTER TABLE
-- orders DROP COLUMN discount_code_id, DROP COLUMN discount_code, DROP COLUMN
-- discount_cents; ALTER TABLE order_lines DROP COLUMN code_discount_cents;
-- ALTER TABLE return_lines DROP COLUMN code_discount_cents; (leeg bij
-- uitrol: er wordt live nog niet verkocht)

CREATE TABLE IF NOT EXISTS discount_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  percent_bp INT UNSIGNED NOT NULL,
  min_subtotal_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,
  -- NULL: geen maximum.
  max_uses INT UNSIGNED NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  created_by VARCHAR(60) NOT NULL,
  stopped_at DATETIME(3) NULL,
  stopped_by VARCHAR(60) NULL,
  UNIQUE KEY uq_discount_codes_code (code),
  KEY ix_discount_codes_time (ends_at, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS discount_redemptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  email_hash CHAR(64) NOT NULL,
  redeemed_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_redemptions_customer (code_id, email_hash),
  UNIQUE KEY uq_redemptions_order (order_id),
  CONSTRAINT fk_redemptions_code FOREIGN KEY (code_id) REFERENCES discount_codes (id),
  CONSTRAINT fk_redemptions_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code_id BIGINT UNSIGNED NULL AFTER subtotal_cents;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code VARCHAR(32) NULL AFTER discount_code_id;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents BIGINT NOT NULL DEFAULT 0 AFTER discount_code;
ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS code_discount_cents BIGINT NOT NULL DEFAULT 0 AFTER line_total_cents;
ALTER TABLE return_lines ADD COLUMN IF NOT EXISTS code_discount_cents BIGINT NOT NULL DEFAULT 0 AFTER quantity;
