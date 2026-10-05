---
paths:
  - "src/app/**/*.{ts,tsx,css}"
  - "src/components/**/*.{ts,tsx}"
  - "messages/*.json"
---

# Frontend regels — WonZo

Laadt alleen bij UI-werk.

Dit bestand gaat over **hoe** je bouwt. Drie buren:
`docs/BRAND.md` zegt hoe het eruitziet, `docs/SCHERMEN.md` zegt **wat** er op
een scherm hoort en waarom, `docs/ACCESSIBILITY.md` zegt wat iedereen moet
kunnen gebruiken. Lees ze voordat je een nieuw scherm maakt.

Elk scherm met data heeft vier toestanden — laden, leeg, fout, gevuld — en een
handeling heeft een succestoestand. Zie `docs/SCHERMEN.md`. Valt de
leverancier uit, dan volgt het scherm `docs/SUPPLIER_RESILIENCE.md`.

## Kleur

Alle kleuren via CSS-variabelen, zodat donkere modus één plek raakt. Gebruik
`bg-background`, `bg-surface`, `text-foreground`, `text-muted`,
`border-border` — **geen vaste kleuren**. Een blok met een hardgecodeerde
donkere achtergrond blijft donker in lichte modus en leest dan als een fout.

Uitzonderingen mogen bestaan, maar alleen met een reden erbij in het
commentaar (een balk die als donkere app-balk ontworpen is, een scrim achter
een paneel, een element waarvan de kleur wettelijk vastligt).

De contrastregels staan in `docs/BRAND.md`. Reken elke nieuwe combinatie na.

### Native formulierelementen

Geef een `<select>` nooit een doorzichtige achtergrond. De browser rendert het
uitklapmenu dan met zijn eigen lichte achtergrond terwijl de tekstkleur van het
donkere thema wordt geërfd: grijs op wit, onleesbaar. Zet een expliciete
achtergrond- én tekstkleur op zowel het `<select>` als de `<option>`s.

### Uitklappanelen en `overflow-hidden`

Een sectie met `overflow-hidden` knipt élk absoluut gepositioneerd paneel af
dat eruit steekt. Zet die eigenschap op het element dat het écht nodig heeft,
niet op de sectie eromheen.

## Layout

- Mobile first. Max contentbreedte vastleggen en overal gebruiken.
- Spacing alleen via de schaal van het framework. Geen willekeurige pixels.
- Productgrid: 2 kolommen mobiel, 3 tablet, 4 desktop.

## Componenten

Next.js met TypeScript en Tailwind (D-00). **Next.js 16.3 wijkt af van wat
je erover weet** (o.a. `proxy.ts` in plaats van `middleware.ts`, getypeerde
`PageProps`/`LayoutProps`): lees eerst de bijbehorende handleiding in
`node_modules/next/dist/docs/` voordat je routing, data of configuratie
schrijft, en volg de meldingen over verouderde API's. Tailwind gebruikt de
CSS-variabelen uit `docs/BRAND.md`; geen UI-kit. Talen: Nederlands en Engels
(D-32). Geen donkere modus in de eerste versie (D-33).

- Server-rendered tenzij er interactie nodig is.
- Componenten importeren domeintypes alleen uit `src/lib/catalog/types.ts` en
  `src/lib/**` — nooit uit een adapter of een leverancierschema.
- Een bedrag tonen mag; een bedrag berekenen gebeurt in `src/lib/pricing/`.
- Een laadscherm hoort bij de route die écht op data wacht, nooit hoog in de
  boom. Te hoog betekent dat een pagina zonder data ook met een skelet begint,
  en dat een 404 als status 200 de deur uit gaat.
- Statische inhoud (kop, formulier, uitleg) hoort in de eerste HTML; wat een
  externe partij moet leveren zet je in een eigen laadgrens.
- Lege staat is een uitnodiging tot actie, niet alleen "geen resultaten".
- Artikelnummers en prijzen met `tabular-nums`, zodat kolommen uitlijnen.

## Toegankelijkheid

Doel: WCAG 2.2 AA. **De volledige eisen staan in `docs/ACCESSIBILITY.md`** —
lees die bij elk nieuw scherm of formulier. De vier die het vaakst misgaan:

- Focusring altijd zichtbaar; alles bereikbaar met Tab in logische volgorde.
- Formulierfouten in tekst, gekoppeld via `aria-describedby` — niet alleen
  kleur of een rode rand. Label kort; uitleg als beschrijving, niet in de naam.
- **Een knop die niet kan, zegt waarom**: `aria-disabled` plus uitleg in een
  `role="status"`, in plaats van een stille `disabled`.
- Beweging langer dan vijf seconden is te pauzeren; `prefers-reduced-motion`
  wordt gerespecteerd.

## Teksten

- Geen hardgecodeerde tekst. Alles via de taalbestanden.
- Alle talen hebben dezelfde sleutels. Een ontbrekende sleutel hoort de bouw te
  laten falen, niet stilletjes de sleutelnaam op het scherm te zetten.
- Gebruik logische eigenschappen (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`):
  het kost niets en houdt de deur open voor een taal die rechts begint.
- Bedragen in de notatie van de markt, ook op anderstalige pagina's, als je
  maar in één land levert en de factuur in één taal is.

## Performance

- Afbeeldingen met expliciete breedte en hoogte tegen verspringen, en altijd
  een `sizes` zodra de foto meeschaalt — zonder dat kiest de browser de
  grootste variant, ook op een telefoon.
- Externe foto's door de eigen beeldoptimalisatie, met een eigen minimale
  cachetijd: media-servers van leveranciers zetten korte tijden, en dan haalt je
  server dezelfde foto telkens opnieuw op.
- Lazy loading behalve de eerste rij van het grid en het grootste beeld boven
  de vouw.
- Geen library zonder te vragen; boven 15 kB gzipped altijd met een reden.
- Budget (`BELEID`): LCP < 2,5 s op een nagebootste 4G-verbinding, CLS < 0,1.
  Een claim over prestaties zonder meting is een `AANNAME`.

## SEO

- Eén `<h1>` per pagina.
- Metadata op **elke** route: titel, omschrijving, canonical, taalvarianten.
  Ook als de gegevens uit een andere bron komen dan de rest van de pagina —
  een route die daarop uitvalt heeft geen titel en geen canonical, en dat zie
  je niet in de browser.
- De canonical draagt geen parameters die bij déze bezoeker horen.
- Productpagina's krijgen gestructureerde data met prijs en beschikbaarheid,
  en lopende tekst die uit dezelfde velden is opgebouwd. Een andere
  omschrijving in de markering dan op de pagina is reden om de markering te
  negeren.
- **Geen sterrengemiddelde zolang er geen echte beoordelingen zijn.**
- Markering beschrijft wat er op de pagina staat. Een vragenlijst hoort bij de
  pagina waar de vragen de hoofdinhoud zijn.
- Een pagina met alleen een productraster krijgt lopende tekst: een korte
  inleiding onder de `<h1>`, en uitleg onderaan.
- URL's zijn leesbare woorden in de taal van de winkel, niet de interne
  nummers van de leverancier. Verandert er een, laat de oude dan omleiden met
  een 308 — en doe dat in de laag vóór de pagina, want vanuit de pagina zelf is
  de HTML al onderweg.
