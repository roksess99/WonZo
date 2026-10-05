---
paths:
  - "db/**"
  - "src/lib/db/**"
  - "src/lib/orders/**"
  - "src/lib/payments/**"
  - "src/lib/checkout/**"
  - "src/lib/invoices/**"
  - "src/lib/returns/**"
  - "src/lib/discounts/**"
  - "src/lib/admin/**"
---

# Database en persistentie

Laadt bij werk aan schema, migraties, transacties en alles wat bestellingen
of betalingen opslaat. De entiteiten staan in `docs/DATAMODEL.md`; migraties
in productie in `docs/CI_CD.md`.

## Wat waar woont

**Bedrijfskritieke staat staat in de database met transacties.** Nooit op het
filesystem, nooit in het geheugen van één proces, nooit alleen in een cookie:

- bestellingen, bestelregels, statusovergangen
- betalingen, webhook-events, terugbetalingen
- factuur- en creditnummers (tellers)
- sessies, uitnodigingen, herstelcodes
- voorraadreserveringen, kortingscodegebruik
- idempotentiesleutels, outbox, job-claims
- auditlog

Het filesystem mag alleen voor tijdelijke of **reproduceerbare** gegenereerde
data: cache, build-uitvoer, een PDF die opnieuw te maken is uit bevroren
gegevens. Gaat het bestand verloren, dan mag er niets weg zijn dat niet terug
te rekenen is. Een deploy die naar een nieuwe map kopieert, of een tweede
proces, mag geen bedrijfsstaat kunnen breken.

## Transacties en gelijktijdigheid

- Een statusovergang en haar neveneffect-records (outbox, audit, event) in
  **één transactie**.
- Statusovergang als compare-and-set:
  `UPDATE … SET status = :to WHERE id = :id AND status = :from` — nul rijen
  geraakt betekent: iemand anders was eerst; niet stil doorgaan.
- Unieke sleutels voor alles wat maar één keer mag (idempotentiesleutel,
  provider-event-id, één open retour per bestelling, één code per klant).
- Tellers (factuurnummers) via een vergrendelde rij in dezelfde transactie als
  het document.
- Externe calls (betaaldienst, leverancier, mail) **nooit binnen** een open
  databasetransactie: intent vastleggen en committen, dan de call, dan de
  uitkomst in een nieuwe transactie (`docs/PAYMENTS.md`).

## Migraties

- Genummerd, in `db/migrations/`, in Git, en nooit achteraf gewijzigd zodra
  ze ergens gedraaid zijn.
- **Expand → migrate → contract.** Eerst toevoegen (kolom nullable of met
  default), dan code die beide vormen aankan, dan data omzetten, en pas in een
  latere release het oude weghalen. Zo is elke stap terug te draaien door de
  vorige code te deployen.
- Elke migratie heeft een **rollbackplan**: een down-migratie, of de expliciete
  vaststelling dat terug gaan via restore gaat, met de reden. Geen migratie
  zonder dat plan.
- Herhaalbaar zonder schade (bijv. `IF NOT EXISTS` waar de database dat
  ondersteunt) of bewaakt door een migratietabel.
- Een onbekende databasemogelijkheid eerst op een wegwerptabel meten
  (`EERDER WAARGENOMEN`: een gedeeld MariaDB-account weigerde elke
  gegenereerde kolom).
- Lange of vergrendelende migraties (index op een grote tabel) apart, buiten
  piekuren, met een schatting van de duur.
- **Destructieve SQL draait Claude niet** (de hook blokkeert `DROP`,
  `TRUNCATE` en `DELETE` zonder `WHERE` in de shell). Het hoort in een
  gereviewde migratie die een mens uitvoert.

## Controles

- Een script dat verbinding én schema controleert (migratiestand gelijk aan de
  code). Draait na elke deploy en elke migratie.
- Integratietests tegen een echte database van dezelfde soort en
  hoofdversie, niet tegen een in-memory vervanger met andere semantiek.
