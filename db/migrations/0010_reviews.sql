-- Wat: beoordelingen (D-12, eigenaar 2026-10-15): de klant beoordeelt de
-- winkel en de artikelen die hij kocht, via een link die bij zijn bestelling
-- hoort. Eén beoordeling per bestelling en onderwerp (de winkel, of één
-- artikel), afgedwongen met een unieke sleutel. Een beoordeling verschijnt
-- meteen; verbergen alleen met een reden (status HIDDEN, de reden erbij en in
-- het logboek). De sleutel in de link staat alleen als hash in de database.
-- Afmelden voor uitnodigingen geldt voor het mailadres en wordt bewaard als
-- hash van het adres, niet als het adres zelf.
-- rollback: DROP TABLE reviews, review_tokens, review_optouts; (leeg bij
-- uitrol: er wordt live nog niet verkocht)

CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  -- 'shop' of 'product'.
  subject VARCHAR(10) NOT NULL,
  -- Het artikel (bron en id, zoals in de bestelregel); leeg voor de winkel, zodat de unieke sleutel werkt.
  source VARCHAR(20) NOT NULL DEFAULT '',
  product_id VARCHAR(20) NOT NULL DEFAULT '',
  rating TINYINT UNSIGNED NOT NULL,
  -- De tekst en de naam die de klant zelf koos (docs/PRIVACY.md).
  body VARCHAR(2000) NULL,
  display_name VARCHAR(60) NULL,
  locale VARCHAR(5) NOT NULL,
  status VARCHAR(10) NOT NULL,
  hidden_reason VARCHAR(200) NULL,
  reply VARCHAR(2000) NULL,
  replied_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_order_subject (order_id, subject, source, product_id),
  KEY ix_product (source, product_id, status, created_at),
  KEY ix_subject (subject, status, created_at),
  CONSTRAINT fk_reviews_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- De sleutel in de uitnodiging, alleen als hash; per mail een eigen sleutel.
CREATE TABLE IF NOT EXISTS review_tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  KEY ix_order (order_id),
  CONSTRAINT fk_review_tokens_order FOREIGN KEY (order_id) REFERENCES orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Wie geen uitnodigingen meer wil: de SHA-256 van het mailadres (kleine letters).
CREATE TABLE IF NOT EXISTS review_optouts (
  email_hash CHAR(64) NOT NULL PRIMARY KEY,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
