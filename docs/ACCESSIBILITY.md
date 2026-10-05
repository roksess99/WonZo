# Toegankelijkheid

## Drie vragen, apart beantwoord

| Vraag | Antwoord in deze set |
|---|---|
| **Technisch doel** | **WCAG 2.2 niveau AA** — `BELEID`, vastgelegd in D-28. Geldt ongeacht of de wet het eist; D-20 gaat alleen over de juridische vraag |
| **Juridische toepasselijkheid** | `WETTELIJK`, te bevestigen: de European Accessibility Act (Richtlijn (EU) 2019/882) geldt sinds 28 juni 2025 voor o.a. e-commercediensten aan consumenten; in NL omgezet in nationale wetgeving. De geharmoniseerde norm (EN 301 549) verwijst naar WCAG. **Of en hoe dit op deze winkel van toepassing is, laat de eigenaar bevestigen** (D-20) |
| **Mogelijke vrijstellingen** | Micro-ondernemingen die diensten leveren zijn onder de EAA vrijgesteld (minder dan 10 werknemers en jaaromzet of balanstotaal ≤ € 2 mln — `WETTELIJK`, te bevestigen). Een vrijstelling verandert het technische doel niet; het is een kwestie van aansprakelijkheid, niet van kwaliteit |

Doe geen claim op de site ("volledig toegankelijk", "WCAG-gecertificeerd")
zonder een audit die dat onderbouwt.

---

## Eisen per onderwerp

### Toetsenbord en focus

- Alles bereikbaar en bedienbaar met het toetsenbord, in een logische
  volgorde; geen toetsenbordval.
- Focusring altijd zichtbaar en niet verborgen achter een vaste balk (WCAG
  2.4.11 Focus Not Obscured). Nooit `outline: none` zonder vervanging.
- Een "naar inhoud"-link als eerste focusbaar element.

### Semantische HTML

- Eén `<h1>`, koppen in volgorde; landmarks (`header`, `nav`, `main`,
  `footer`).
- Een knop is een `<button>`, een link is een `<a href>`. Geen klikbare `div`.
- Tabellen met data krijgen `<th>` en `scope`.
- Taal van de pagina in `lang`; afwijkende taal (een productnaam in de taal
  van de leverancier) waar praktisch met `lang` op het element.

### Schermlezer, labels en namen

- Elk invoerveld een zichtbaar `<label>`. Een placeholder is geen label.
- **Naam en beschrijving gescheiden**: label kort, uitleg eronder gekoppeld met
  `aria-describedby`. Een label dat de uitleg omvat laat een schermlezer een
  alinea voorlezen waar één woord hoort.
- Elke afbeelding `alt`; decoratief `alt=""`. Een productfoto heeft als alt de
  productnaam, niet "afbeelding".
- Iconen zonder tekst krijgen een toegankelijke naam.
- Dynamische meldingen (toegevoegd aan winkelwagen, fout bij code) via een
  `role="status"` of `aria-live="polite"`, zonder de focus te verplaatsen.

### Formulieren en fouten

- Fouten in tekst bij het veld, gekoppeld met `aria-describedby`, en
  `aria-invalid` op het veld. Niet alleen kleur of een rode rand.
- Bij meer dan één fout: een samenvatting bovenaan die focus krijgt en naar de
  velden linkt.
- `autocomplete` op naam, adres, mail, telefoon (WCAG 1.3.5); juiste `type` en
  `inputmode`.
- Een mislukt formulier houdt zijn waarden.
- **Een knop die niet kan, zegt waarom**: `aria-disabled` met uitleg bij de
  klik, in plaats van een stille `disabled`.
- Geen tijdslimiet zonder waarschuwing en mogelijkheid tot verlengen.

### Checkout

- De hele reis — winkelwagen, adres, betaalmethode, bevestigen — met alleen
  toetsenbord en met een schermlezer te doorlopen (E2E + handmatig).
- Het totaalbedrag en wat de knop doet ("Bestellen en betalen") zijn als tekst
  beschikbaar, niet alleen visueel.
- Geen herhaalde invoer van gegevens die al gegeven zijn (WCAG 3.3.7
  Redundant Entry).
- Een eventuele verificatie bij de betaaldienst valt buiten onze controle; kies
  bij D-05 een provider waarvan de betaalpagina toegankelijk is, en test hem.
- Doelgrootte van knoppen en bedieningselementen minstens 24×24 CSS-pixels
  (WCAG 2.5.8); voor de primaire actie op mobiel 44×44 (`BELEID`, `docs/SCHERMEN.md`).

### Contrast en kleur

- Tekst 4,5:1; grote tekst en UI-onderdelen (randen van velden, focusring)
  3:1. Rekenen, niet schatten: de tabel in `docs/BRAND.md`.
- Kleur draagt nooit alleen de boodschap: status met icoon én woord.
- Beide thema's (licht en donker) apart nagerekend.

### Responsief en reflow

- Bruikbaar op 320 CSS-pixels breed zonder horizontaal scrollen (WCAG 1.4.10),
  behalve waar tweedimensionaal nodig (een tabel in het paneel valt terug op
  minder kolommen).
- Tekst tot 200 % te vergroten zonder verlies van inhoud; tekstafstand
  aanpasbaar (1.4.12).

### Beweging

- Beweging die automatisch langer dan vijf seconden loopt is te pauzeren
  (2.2.2); de pauzeknop mag visueel verborgen zijn tot hij focus krijgt, maar
  moet bestaan.
- `prefers-reduced-motion` respecteren: geen parallax, autoplay of
  carrouselbeweging.
- Niets dat meer dan drie keer per seconde flitst.

### Dialogen en panelen

- Een dialoog gebruikt `<dialog>` of `role="dialog"` met `aria-modal`, een
  toegankelijke naam, focus naar binnen bij openen, focus gevangen binnen de
  dialoog, Escape sluit, en focus terug naar de knop die hem opende.
- Een uitklappaneel (filter, menu) met `aria-expanded` op de knop.

### Facturen en PDF's

- Een PDF-factuur is een **getagde PDF**: leesvolgorde, koppen, tabellen met
  koprijen, taal ingesteld, documenttitel, tekst als tekst (geen afbeelding van
  tekst).
- Of de gekozen PDF-bibliotheek getagde PDF's kan maken is een `AANNAME` tot
  gemeten; leg de meting vast bij D-21.
- De factuurgegevens zijn ook in HTML beschikbaar (bijv. in het paneel of de
  bevestigingsmail), zodat de PDF niet de enige bron is.

### Mail

- Tabellen voor opmaak krijgen `role="presentation"`.
- Echte tekst, geen tekst in afbeeldingen; `alt` op het logo.
- Voldoende contrast in licht en donker.

---

## Controleren

| Wat | Hoe |
|---|---|
| Geautomatiseerd | een axe-achtige check in de E2E-tests op de kritieke pagina's (vindt een deel, niet alles) |
| Toetsenbord | handmatig, elke nieuwe pagina, van boven naar beneden |
| Schermlezer | handmatig op de checkout en het retourformulier, met minstens één schermlezer per platform dat de doelgroep gebruikt |
| Zoom en reflow | 200 % en 320 px |
| Contrast | de tabel in `docs/BRAND.md` |

Automatische tools vinden een minderheid van de problemen (`AANNAME`, gangbare
schatting, niet gemeten in dit project). Handmatig testen blijft nodig.
