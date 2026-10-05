# CI/CD

Generieke architectuur. Het CI-platform, de hosting en de deploymethode zijn
D-00 en D-17; niets hieronder neemt een provider aan, behalve waar het als
voorbeeld is gemarkeerd.

---

## Pipeline

```text
install --frozen-lockfile
  ↓
lint            (incl. importgrenzen: geen supplier-DTO's buiten de adapter,
  ↓              geen database in components/)
typecheck
  ↓
unit tests
  ↓
integration tests        (echte database in een container of service)
  ↓
build
  ↓
security checks          pnpm audit · secret scan · dependency review
  ↓
E2E                      (op de build, tegen testmodus/stubs)
  ↓
artefact                 één build, gepromoot naar staging en productie
```

- **Een stap die faalt stopt de pipeline.** Geen `continue-on-error` op een
  kwaliteitspoort.
- **De build wordt één keer gemaakt** en ongewijzigd gepromoot. Opnieuw bouwen
  voor productie betekent dat je iets anders uitrolt dan je getest hebt.
- **Configuratie per omgeving uit de omgeving**, niet in het artefact.
  Opstartvalidatie weigert te starten bij ontbrekende of ongeldige variabelen.
- De template zelf heeft een eigen, kleine workflow:
  `.github/workflows/validate-template.yml` (`validate-template.mjs` +
  `test-guard.mjs`). Voorbeeld voor GitHub Actions; vertaal naar het platform
  van D-17.

## Branches en pull requests

- `main` is **beschermd**: geen directe push, geen force push, geen
  verwijdering. Instellen op de remote — de guard-hook vangt alleen Claude.
- Werk op `feature/<naam>` of `fix/<naam>`; mergen via een PR.
- **Vereist voor merge:** alle CI-stappen groen, minstens één review (ook als
  de reviewer de eigenaar zelf is: een PR dwingt je de diff te lezen),
  branch up-to-date met `main`.
- Een PR beschrijft: wat, waarom, hoe getest, migratie ja/nee, rollback.
- Claude maakt geen merge en pusht niet zonder expliciete toestemming
  (`ask`-regels; `docs/CLAUDE_CODE.md`).

## Omgevingen

| Omgeving | Doel | Data | Betaaldienst | Leverancier |
|---|---|---|---|---|
| lokaal | ontwikkelen | seed/fixtures | testsleutel of stub | mock (zonder token) |
| CI | tests | wegwerp | stub | fixtures |
| staging | release-kandidaat bekijken | geanonimiseerd of synthetisch — **nooit** een kopie van productie met echte klantgegevens | testmodus | sandbox als die bestaat, anders mock; **nooit** echte inkooporders |
| productie | de winkel | echt | live | live |

Of er een staging komt is D-17. Zonder staging gaat er meer gewicht op E2E en
op een snelle rollback.

## Naar productie

- **Productie-uitrol vraagt een expliciete goedkeuring van een mens**
  (approval-gate in de pipeline, of handmatig door de eigenaar). Claude rolt
  niet uit; de guard-hook blokkeert deploy- en infra-commando's.
- Uitrol buiten piekuren; niet vlak voor een periode waarin niemand kan
  ingrijpen.
- Na de uitrol: health check, smoke test (homepage, productpagina,
  winkelwagen, checkout tot het betaalscherm), foutpercentage in de gaten
  houden (`docs/OBSERVABILITY.md`).

## Migraties

Volgorde bij een release met een schemawijziging:

```text
1. backup (en weten dat restore werkt — docs/DISASTER_RECOVERY.md)
2. migratie die alleen toevoegt (expand)
3. code die oude én nieuwe vorm aankan
4. data omzetten (los, herhaalbaar)
5. latere release: oude vorm weghalen (contract)
```

- Elke migratie heeft vóór de merge een **rollbackplan** in de PR.
- Productiemigraties draait een mens of de pipeline na goedkeuring, niet
  Claude.
- Migraties en code moeten in elke tussenstand samen kunnen werken: de
  vorige code moet tegen het nieuwe schema blijven draaien. Dan is rollback
  van de code altijd mogelijk zonder rollback van de database.

## Rollback

| Wat | Hoe | Wanneer |
|---|---|---|
| Code | vorige artefact opnieuw uitrollen | foutpercentage omhoog, kritieke reis kapot |
| Configuratie | vorige waarden; wijzigingen zijn gelogd | — |
| Schema | alleen via down-migratie als die veilig is; anders vooruit repareren | zelden; expand/contract maakt het meestal overbodig |
| Data | restore naar een tijdstip (`docs/DISASTER_RECOVERY.md`) | laatste redmiddel; betalingen sinds dat tijdstip via reconciliatie terughalen |

**Feature flags** voor riskante wijzigingen in het geldpad, zodat
uitschakelen geen deploy vraagt. Een flag heeft een eigenaar en een
einddatum.

## Wat Claude doet en niet doet

| Mag | Mag niet |
|---|---|
| Pipeline-configuratie schrijven en lokaal de stappen draaien | Pushen, mergen of taggen zonder toestemming |
| Een PR-beschrijving voorbereiden | Productie uitrollen, productiemigraties draaien |
| Een rollbackplan opschrijven | Branch protection of CI-poorten uitschakelen |
