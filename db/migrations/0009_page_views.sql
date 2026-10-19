-- Wat: de eigen statistieken (D-10, eigenaar 2026-10-15): hoe vaak een pagina
-- per dag bekeken wordt, op de eigen server, zonder cookies. Er staat geen
-- persoonsgegeven in: geen IP-adres, geen browser, geen bezoeker-id — alleen
-- een dag, een pad en een aantal. De sleutel in een statuslink komt er nooit
-- in: zo'n pad wordt bij het tellen ingekort (src/lib/stats.ts).
-- rollback: DROP TABLE page_views; (alleen tellingen, niets dat de winkel
-- nodig heeft om te werken)

CREATE TABLE IF NOT EXISTS page_views (
  day DATE NOT NULL,
  path VARCHAR(200) NOT NULL,
  views INT UNSIGNED NOT NULL,
  PRIMARY KEY (day, path),
  KEY ix_path (path, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
