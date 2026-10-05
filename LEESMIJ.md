# Template voor een nieuwe webshop

Een documentatie- en controleset waarmee een nieuwe webshop begint. Hij bevat
wat een half jaar bouwen aan een eerdere dropship-winkel heeft opgeleverd —
niet het assortiment, maar de dingen die bij élke webshop met een
leverancier-API terugkomen — plus de regels, hooks en checks die Claude Code
op koers houden.

Dit project is gestart met een startprompt die de set inventariseerde en
controleerde; die prompt is na gebruik niet meegenomen.

## Hoe de set werkt

```text
Jij beslist            → docs/DECISIONS.md      (waarheid)
CLAUDE.md              → globale regels          (richting, altijd geladen)
.claude/rules/         → regels per gebied        (laden bij het werk)
docs/                  → referentie en contracten (context)
.claude/settings.json  → permissies en hooks      (enforcement)
scripts/, CI           → validatie en tests        (bewijs en gate)
```

Welke bron voorgaat bij een tegenspraak staat in `CLAUDE.md` § Autoriteit;
hoe je claims labelt in `docs/AUTHORITY.md`; wat technisch wordt afgedwongen
in `docs/CLAUDE_CODE.md`. Het overzicht van alle documenten staat in
`CLAUDE.md` § Documenten.

**Controleren:**

```bash
node scripts/validate-template.mjs
```

```bash
node scripts/test-guard.mjs
```

De eerste controleert verwijzingen, plaatshouders, frontmatter, JSON en
beslissingen; de tweede bewijst dat de guard-hook doet wat hij belooft. Met
`--project` weigert de validator ook elke plaatshouder die nog openstaat —
gebruik dat zodra de winkel live gaat. Beide vereisen alleen Node.

**Eén keer instellen:** vertrouw de projectmap als Claude Code daarom vraagt —
hooks in een project draaien pas na die bevestiging.

## 1. De plaatshouders invullen

Overal waar `<<NAAM>>` staat hoort iets ingevuld te worden. Staat iets nog
niet vast, laat de plaatshouder dan **staan**: een lege plek die opvalt is
beter dan een verzonnen waarde die later voor waar wordt aangezien. De
validator kent alleen de namen in deze tabel; een andere plaatshouder is een
fout.

<!-- placeholder-registry:start -->
| Plaatshouder | Wat erin komt | Bron |
|---|---|---|
| `<<SHOP>>` | De naam van de winkel — ingevuld: WonZo (2026-10-04) | eigenaar |
| `<<DOMEIN>>` | Het domein zonder protocol — ingevuld: wonzo.nl (2026-10-04) | eigenaar |
| `<<MARKT>>` | Land en taal, bijv. "Nederland, NL primair" — ingevuld: Nederlandse markt (2026-10-04) | eigenaar |
| `<<ASSORTIMENT>>` | Wat je verkoopt, in één zin — ingevuld (2026-10-04) | eigenaar |
| `<<LEVERANCIER>>` | Naam van de groothandel of API-partij — ingevuld: BigBuy (2026-10-04) | eigenaar (D-01) |
| `<<BEDRIJFSNAAM>>` | Naam zoals in het handelsregister — ingevuld: R.M.A. Marketing (2026-10-04) | eigenaar |
| `<<KVK>>`, `<<BTW>>` | Inschrijving en btw-nummer — KvK ingevuld: 42126738 (2026-10-04); btw-nummer nog open | eigenaar |
| `<<SUPPORT_MAIL>>` | Het adres dat op de site staat — ingevuld: info@wonzo.nl (2026-10-04) | eigenaar |
| `<<KLEUR_ACCENT>>`, `<<KLEUR_INK>>`, `<<KLEUR_GREY>>`, `<<KLEUR_ZINC>>`, `<<KLEUR_FOCUS>>` | Merkkleuren — ingevuld 2026-10-04; focuskleur 2026-10-05 | huisstijl (`docs/BRAND.md`) |
| `<<TOKEN_BACKGROUND>>`, `<<TOKEN_FOREGROUND>>`, `<<TOKEN_SURFACE>>`, `<<TOKEN_MUTED>>`, `<<TOKEN_BORDER>>`, `<<TOKEN_DANGER>>`, `<<TOKEN_SUCCESS>>`, `<<TOKEN_WARNING>>` | Semantische kleuren — ingevuld 2026-10-04, behalve `<<TOKEN_DANGER>>`, `<<TOKEN_SUCCESS>>`, `<<TOKEN_WARNING>>` | huisstijl, na contrastmeting |
| `<<LOGO_BESTANDSNAAM>>`, `<<LOGO_MIN_AFMETING>>`, `<<LOGO_VRIJE_RUIMTE>>` | Logobestanden en regels — ingevuld 2026-10-04 met de echte bestandsnamen | ontwerper |
| `<<FONT_WOORDMERK>>`, `<<FONT_KOPPEN>>`, `<<FONT_BODY>>`, `<<FONT_LABELS>>` | Lettertypen — ingevuld 2026-10-04 | ontwerper |
| `<<RADIUS_KLEIN>>`, `<<RADIUS_GROOT>>` | Afronding — ingevuld 2026-10-04 | ontwerper |
| `<<SFEERBEELD_JA_NEE>>`, `<<TONE_OF_VOICE>>`, `<<PRODUCTSOORT>>` | Beeld en toon — toon ingevuld 2026-10-04; sfeerbeeld en productsoort open | eigenaar |
| `<<API_DOCUMENTATIE>>`, `<<API_HOST>>`, `<<API_BASE_PATH>>`, `<<AUTH_METHODE>>`, `<<ENV_SLEUTEL>>`, `<<RATE_LIMIT>>`, `<<PLATFORM>>` | Gegevens van de leverancier-API — ingevuld 2026-10-04 uit de documentatie (`GEDOCUMENTEERD`) | meting (`docs/api/LEVERANCIER.md`) |
| `<<DATUM>>`, `<<ANTWOORD>>` | Datum en uitkomst van een meting | meting |
| `<<RPO>>`, `<<RTO>>`, `<<INCIDENT_EIGENAAR>>`, `<<BACKUP_FREQUENTIE>>`, `<<BACKUP_RETENTIE>>`, `<<OFFSITE_LOCATIE>>`, `<<RESTORE_TEST_INTERVAL>>` | Hersteldoelen | eigenaar (D-19) |
| `<<LOG_RETENTIE>>`, `<<ERROR_RETENTIE>>`, `<<ERROR_LOCATIE>>` | Logs en error tracking | eigenaar (D-18, D-24) |
| `<<HOSTING_LOCATIE>>`, `<<DB_ENCRYPTIE>>` | Waar en hoe de data staat | eigenaar (D-00, D-06) |
| `<<BETAALDIENST_LOCATIE>>`, `<<LEVERANCIER_LOCATIE>>`, `<<MAIL_LOCATIE>>` | Waar ontvangers de data verwerken | eigenaar (D-05, D-01, D-29) |
<!-- placeholder-registry:end -->

## 2. De beslissingen langslopen

`docs/DECISIONS.md` is geen verslag maar een **vragenlijst met afhankelijkheden**.
Elke beslissing heeft een status (`OPEN`, `BLOCKED`, `READY`, `DECIDED`,
`SUPERSEDED`). Een beslissing wordt pas `DECIDED` als jij hem neemt, met de
reden erbij — en pas dan komt er code voor. De helft van het herwerk kwam
eerder doordat een keuze wel in code stond maar nergens in woorden.

Begin met de twee waar alles op wacht: **D-00 framework en hosting** en
**D-01 leverancier**. De grafiek bovenin DECISIONS toont wat er daarna
vrijkomt.

## 3. De API meten voordat je bouwt

`docs/api/LEVERANCIER.md` is een invulformulier met de vragen die je anders pas
ná het bouwen blijkt te moeten stellen. Loop hem af met echte verzoeken op het
echte account. Elk antwoord krijgt `GEMETEN` met de datum. Wat niet gemeten
is, is een aanname.

De duurste les staat daar als vraag 7: **de voorraad en de prijs moeten van
dezelfde verkoper komen.** Daar ging eerder een half jaar lang gemiddeld € 60
per bestelling in zitten zonder dat iemand het zag (`EERDER WAARGENOMEN`).

## Wat hier bewust níet in zit

- **Geen applicatiecode.** De documenten dragen de lessen; de code komt vers.
  Wel tooling voor de set zelf: de validator, de guard-hook en zijn tests.
- **Geen keuze voor framework, database, betaaldienst of hosting.** Die staan
  open in DECISIONS, met de afweging erbij.
- **Geen juridisch advies.** Wettelijke punten zijn gemarkeerd met `WETTELIJK`
  en een bron, en horen door een adviseur bevestigd te worden.
- **Geen marketingteksten.** Die horen bij de huisstijl en die is er nog niet.
