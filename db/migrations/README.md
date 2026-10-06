# Migraties

Eén bestand per wijziging aan het schema, `NNNN_wat_het_doet.sql`, in
volgorde genummerd. `pnpm build` draait ze automatisch vóór de bouw, ook op
Hostinger (D-06); `pnpm db:status` laat zien wat er openstaat.

Regels (`.claude/rules/database.md` § Migraties, afgedwongen door
`scripts/db-migrate.mjs`):

- **Nooit een bestand wijzigen of weghalen dat ergens gedraaid heeft.** Het
  script bewaart een checksum en stopt bij een verschil. Schrijf een nieuwe.
- **Elke migratie heeft een regel `-- rollback:`** met het plan om terug te
  gaan: een down-SQL, of "restore uit backup" met de reden.
- **Alleen toevoegen.** Een kolom of tabel weghalen gebeurt pas in een
  latere uitrol, als de code hem niet meer gebruikt (expand → migrate →
  contract). Een mislukte uitrol laat dan de vorige versie werkend achter.
- **Opnieuw te draaien zonder schade** (`CREATE TABLE IF NOT EXISTS`,
  `ADD COLUMN IF NOT EXISTS`): DDL in MariaDB is niet terug te draaien, dus
  een migratie die halverwege faalt wordt de volgende keer opnieuw gestart.
- Bedragen als `BIGINT` in centen met een valutakolom; tijden als
  `DATETIME(3)` in UTC; tekst `utf8mb4`.

Voorbeeld:

```sql
-- Wat: tabel voor ...
-- rollback: DROP TABLE voorbeeld; (leeg bij uitrol, geen gegevens verloren)
CREATE TABLE IF NOT EXISTS voorbeeld (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
