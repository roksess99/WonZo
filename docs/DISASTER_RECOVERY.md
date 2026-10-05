# Disaster recovery

**Een backup die nooit is teruggezet, geldt niet als geverifieerd.** Tot de
eerste geslaagde restoretest is de status van elke backup hieronder
`AANNAME`.

De waarden zijn plaatshouders: ze hangen af van D-00 (hosting), D-06
(database) en D-19 (doelen). Niet invullen met een schatting; invullen met een
keuze van de eigenaar en, waar het een meting is, met `GEMETEN` en een datum.

---

## Doelen

| Wat | Waarde | Toelichting |
|---|---|---|
| **RPO** (hoeveel data mag verloren gaan) | `<<RPO>>` | Betalingen sinds het restorepunt komen terug via reconciliatie met de betaaldienst; bestellingen en klantgegevens niet |
| **RTO** (hoe lang mag de winkel plat liggen) | `<<RTO>>` | Inclusief het terugzetten en controleren, niet alleen het kopiëren |
| **Incident-eigenaar** | `<<INCIDENT_EIGENAAR>>` | Wie beslist en wie de klant informeert |

## Backups

| Wat | Frequentie | Retentie | Versleuteling | Offsite | Status |
|---|---|---|---|---|---|
| Database (volledig) | `<<BACKUP_FREQUENTIE>>` | `<<BACKUP_RETENTIE>>` | at rest, sleutel buiten de backup | `<<OFFSITE_LOCATIE>>` (andere provider of regio dan de database) | `AANNAME` tot restoretest |
| Database (point-in-time / logs) | als de database dat ondersteunt | — | idem | idem | `AANNAME` |
| Opgeslagen facturen (als D-21 = opslaan) | dagelijks | ≥ fiscale termijn | idem | idem | `AANNAME` |
| Configuratie en secrets | bij elke wijziging | — | in een wachtwoordkluis, niet in de backup van de database | — | — |
| Broncode | Git-remote | — | — | tweede remote of export | — |

Wat **niet** gebackupt hoeft: cache, build-uitvoer, gegenereerde bestanden die
uit bevroren data te herleiden zijn (`.claude/rules/database.md`).

Backups zijn **onveranderbaar** of in elk geval niet te verwijderen met de
credentials van de applicatie: een aanvaller of fout die de database wist, mag
de backups niet ook kunnen wissen.

## Restoreprocedure

Op te schrijven zodra de database gekozen is, als stappen die iemand anders
kan uitvoeren:

1. Incident vaststellen, eigenaar inlichten, winkel in onderhoudsmodus
   (geen nieuwe bestellingen tijdens de restore).
2. Restorepunt kiezen; noteren welke periode verloren gaat.
3. Terugzetten naar een **nieuwe** database, niet over de bestaande heen.
4. Controleren: migratiestand, aantallen per tabel, laatste order, laatste
   factuurnummer, tellers.
5. Applicatie naar de nieuwe database wijzen.
6. **Reconciliatie draaien** over de verloren periode: betalingen en
   terugbetalingen bij de betaaldienst, inkooporders bij de leverancier.
7. Factuurnummering controleren: geen nummer dubbel uitgeven dat al bij een
   klant ligt (teller zo nodig verhogen; gat documenteren voor de boekhouder).
8. Onderhoudsmodus uit, monitoren, incidentverslag.

## Restoretest

| Wanneer | Wat | Resultaat |
|---|---|---|
| Vóór livegang | volledige restore naar een lege omgeving, stappen 3–4 | `<<DATUM>>` — nog niet gedaan |
| Daarna, `<<RESTORE_TEST_INTERVAL>>` | idem, met tijdmeting (haalt het de RTO?) | — |

Een restoretest wordt vastgelegd met `GEMETEN`, datum, duur en wat er
misging. Pas dan wordt de status in de backuptabel "geverifieerd".

## Rollback versus restore

| Probleem | Eerst proberen |
|---|---|
| Kapotte release | code-rollback (`docs/CI_CD.md`) — geen restore |
| Foute migratie | vooruit repareren of down-migratie; restore alleen als data verloren is |
| Data per ongeluk gewijzigd | gerichte correctie uit de auditlog/eventlog; restore naar een aparte database om waarden terug te halen |
| Database weg of corrupt | restore |
| Gelekte secrets | roteren (`docs/THREAT_MODEL.md`), geen restore |

## Incident

- Eén eigenaar per incident; een tijdlijn met tijdstippen.
- Betrokken klanten informeren als hun bestelling of gegevens geraakt zijn.
- Datalek: beoordelen of melding aan de toezichthouder en betrokkenen nodig is
  (`WETTELIJK`: AVG art. 33–34 — melding binnen 72 uur na ontdekking als er een
  risico is; laten bevestigen).
- Na afloop: oorzaak, wat werkte, wat niet, en één concrete verbetering.
