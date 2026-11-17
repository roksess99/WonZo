-- Wat: de laatste uitkomst per controle van een externe dienst (fase 6,
-- docs/BEHEER.md § Een werkende sleutel is geen werkende kassa): werkt
-- Mollie echt, weigert BigBuy de sleutel, wat is het tegoed. Een cache, geen
-- bedrijfsstaat: weg is opnieuw meten. Hij staat in de database omdat het
-- tegoed bij BigBuy maar één keer per uur opgevraagd mag worden
-- (docs/api/LEVERANCIER.md, GEMETEN 2026-10-05) en een herstart dat niet mag
-- vergeten.
-- rollback: DROP TABLE service_checks. Er gaat niets verloren dat niet
-- opnieuw gemeten wordt.

CREATE TABLE IF NOT EXISTS service_checks (
  service VARCHAR(30) NOT NULL PRIMARY KEY,
  state VARCHAR(30) NOT NULL,
  detail JSON NULL,
  checked_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
