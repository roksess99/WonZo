# Schermen — wat er op elke pagina hoort

`.claude/rules/frontend.md` gaat over hóe je bouwt. Dit bestand gaat over
**wat** er moet staan, en waarom. Het is de lijst waar een pagina langs gaat
voordat hij af heet.

Dit gaat over de **winkel**. Het beheerpaneel is een ander soort scherm en
staat in `docs/BEHEER.md`.

Een webshop heeft maar een handvol schermen die er echt toe doen. Ze vormen
één weg: binnenkomen → vinden → vertrouwen → afrekenen. Elk scherm heeft één
taak in die weg. Een scherm dat twee dingen tegelijk wil doet ze allebei half.

---

## Het trechterprincipe

| Scherm | Eén taak | De vraag van de klant |
|---|---|---|
| Home | De klant naar zijn product leiden | "Hebben jullie wat ik zoek?" |
| Zoeken / categorie | Kiezen mogelijk maken | "Welke moet ik hebben?" |
| Product | Twijfel wegnemen | "Is dit de goede, en kan ik jullie vertrouwen?" |
| Winkelwagen | Bevestigen en doorlopen | "Klopt dit, en wat kost het totaal?" |
| Afrekenen | Niets meer dan invullen | "Hoe snel ben ik hier klaar?" |
| Bevestiging | Geruststellen | "Is het gelukt, en wat nu?" |

**Hoe verder in de trechter, hoe minder er op het scherm hoort.** Op de
afrekenpagina staat geen navigatie met productgroepen: elke link daar is een
uitgang.

---

## Home

**Taak:** de klant in één handeling naar zijn product brengen.

- Het invulveld waarmee hij zijn product vindt staat **boven de vouw en
  links**. Niet onder een lap tekst, niet in een carrousel.
- Eén primaire actie. De banner ernaast mag mooi zijn maar niet concurreren.
- Drie beloftes die twijfelaars overhalen — verzending, bedenktijd, btw —
  staan altijd in beeld, ook als er een actieblok overheen komt.
- Lopen er acties, dan mogen die de banner vervangen. Lopen ze niet, dan
  **geen lege carrousel en geen "binnenkort aanbiedingen"**: dat is een
  belofte die niemand heeft gedaan.
- Beweegt er iets automatisch? Dan stoppen bij hover en focus, een pauzeknop
  die bereikbaar is, en stilstand bij `prefers-reduced-motion`.

## Categorie en zoekresultaat

**Taak:** kiezen mogelijk maken zonder te verbergen.

- **Filteren verbergt artikelen die wél passen.** De aantallen bij een filter
  tellen alleen artikelen mét een waarde; wie filtert mist alles waar de
  fabrikant het veld niet invulde. Filter dus alleen op eigenschappen waar de
  dekking hoog is, en meet die dekking voordat je het filter bouwt.
- Geen jargon als filterkop. Een eigenschap waarvan de klant niet weet wat hij
  moet kiezen is geen keuze maar een drempel.
- Sorteren op prijs hoort erbij; sorteren op "relevantie" alleen als je kunt
  uitleggen wat dat betekent.
- Elke kaart draagt hetzelfde: beeld, naam, artikelnummer, voorraad, prijs.
  Niet meer. Een kaart met vier knoppen krijgt er geen klikken bij.
- **Lege staat is een uitnodiging.** "Niets gevonden voor X" plus een weg
  terug, niet een lege pagina.
- Lopende tekst onderaan: een pagina met alleen een raster heeft voor een
  zoekmachine geen onderwerp.

## Productpagina

**Taak:** twijfel wegnemen. Dit is de pagina waar de koop valt of niet.

Het koopblok — prijs, voorraad, verzendkosten, knop — staat bij elkaar in één
omlijnd vlak. Niet verspreid over de pagina.

- **Prijs** groot, met "inclusief btw" eronder. Is er korting: het percentage
  erbij. Een doorgestreepte "van"-prijs mag alleen met de wettelijke
  referentie erachter (de laagste prijs van 30 dagen), en met de uitleg erbij
  wát dat bedrag is.
- **Voorraad** als woord én als kleur, met het aantal erbij als dat klopt met
  wat je echt kunt leveren.
- **Verzendkosten en levertijd** vóór de knop. Verzendkosten die pas bij het
  afrekenen verschijnen zijn de meest genoemde reden om af te haken.
- **De knop over de volle breedte**, met de aantalkiezer eronder en niet
  ernaast: negen van de tien klanten bestellen er één, en naast elkaar houden
  de twee elkaar in evenwicht.
- **Bedenktijd en retour** bij de knop, niet alleen in de voorwaarden.
- **Artikelgegevens** als tabel, met de labels zoals de leverancier ze levert.
- **Lopende tekst** opgebouwd uit velden die het artikel écht heeft. Dezelfde
  zinnen gaan naar de gestructureerde data: een andere omschrijving daar dan
  op de pagina is reden om de markering te negeren.
- Geen foto? Een eigen plaatshouder, nooit een gebroken plaatje.

## Winkelwagen

**Taak:** bevestigen dat het klopt.

- Per regel: beeld, naam, nummer, aantal, prijs per stuk én het regeltotaal.
- Aantal aanpassen en verwijderen moeten allebei makkelijk zijn. Verwijderen
  is geen verstopte actie.
- **Het totaal is compleet**: subtotaal, verzendkosten, btw-bedrag. Geen
  bedrag dat pas een scherm later verschijnt.
- Is er een drempel voor gratis verzending, zeg dan hoeveel er nog bij moet.
- Wordt een regel begrensd door voorraad, zeg dat op de regel zelf en bied één
  knop om het recht te zetten. Niet stilletjes verlagen.
- Kortingscode kan hier al: dit is waar iemand met een code in zijn hand gaat
  zoeken.

## Afrekenen

**Taak:** zo snel mogelijk klaar zijn.

- **Geen account verplicht.** Een account vragen voor een eenmalige koop kost
  bestellingen.
- Zo min mogelijk velden. Elk veld dat je weglaat is winst; vul aan wat je
  automatisch kunt opzoeken (adres uit postcode en huisnummer).
- Validatie bij het verlaten van een veld, niet bij elke toetsaanslag.
- Fouten in tekst, bij het veld, gekoppeld voor schermlezers — en bovenaan een
  samenvatting als er meer dan één is.
- Het besteloverzicht blijft in beeld tijdens het invullen.
- **De knop zegt wat er gebeurt**: "Bestellen en betalen".
- Vóór die knop: bedenktijd, voorwaarden en het totaalbedrag nog één keer.
- Tijdens het verzenden is de knop uitgeschakeld en zegt hij dat hij bezig is.
  Dubbel klikken mag nooit twee bestellingen opleveren — afgedwongen op de
  server met de `checkoutAttemptId` (`docs/IDEMPOTENCY.md`), niet alleen met de
  knop.
- Is de prijs sinds de winkelwagen veranderd, dan ziet de klant het nieuwe
  bedrag **vóór** de betaling, met uitleg.

## Bevestiging en status

**Taak:** geruststellen en de verwachting zetten.

- Het ordernummer, het bedrag, en wat er nu gebeurt.
- Een link waarmee de klant de status later terugvindt — met een token erin,
  niet alleen het ordernummer.
- De status komt van de server, niet uit de URL. Is de betaling nog niet
  bevestigd, dan zegt de pagina dat eerlijk ("we wachten op de bevestiging van
  je betaling") en ververst — zie `docs/PAYMENTS.md` § De terugkeerpagina.
- De mail is de echte bevestiging.
- Mislukte of afgebroken betaling: zeg wat er misging en bied één weg terug.
  Geen doodlopend scherm.

## Statische pagina's die er moeten zijn

| Pagina | Waarom |
|---|---|
| Contact met bedrijfsgegevens | Wettelijk, en het eerste waar twijfel heen gaat |
| Algemene voorwaarden | Wettelijk, bereikbaar vóór het afrekenen |
| Privacy | Wettelijk, en moet kloppen met `docs/PRIVACY.md` |
| Retourneren | Wettelijk, met het modelformulier |
| Veelgestelde vragen | Vangt de mails op die je anders beantwoordt |

---

## Vier toestanden per scherm

Elk scherm dat data ophaalt heeft er vier, en drie ervan worden standaard
vergeten. Bouw ze alle vier of het scherm is niet af.

1. **Laden** — een skelet met de vorm van het echte scherm, niet een
   ronddraaiend wieltje in het midden. En het laadscherm hoort bij de route
   die écht wacht, niet hoog in de boom.
2. **Leeg** — met een weg vooruit.
3. **Fout** — zeg wat er misging en wat de klant kan doen. "Er ging iets mis"
   is geen melding maar een schouderophalen.
4. **Gevuld** — het normale geval.

Een scherm met een handeling (toevoegen, bestellen, retour aanmelden) heeft
daarnaast een **succestoestand**: zeg wat er gebeurd is en wat nu.

**Valt de leverancier uit, dan blijft de winkel staan.** Een categorie die
niets teruggeeft toont een lege staat; hij veroorzaakt geen foutpagina. Fouten
die geld raken zijn de uitzondering: die moeten juist luid zijn. Het gedrag per
soort storing staat in `docs/SUPPLIER_RESILIENCE.md`.

---

## Mobiel

Meer dan de helft van de bezoekers. Niet "ook getest op mobiel" maar daar
begonnen.

- De primaire actie is met één duim bereikbaar.
- Raakvlakken minstens 44×44 px.
- Geen hover-only interactie: een telefoon heeft geen hover.
- Invoervelden met het juiste toetsenbord (`type="email"`, `inputmode`,
  `autocomplete`).
- Een vaste balk onderaan kost ruimte; zorg dat hij niets afdekt dat je nodig
  hebt.
- Test op een echt toestel. Een versmald browservenster liegt over
  schermtoetsenborden, over traagheid en over duimafstanden.

---

## Vertrouwen

Een onbekende winkel moet dat verdienen. Wat helpt, in deze volgorde:

1. **Echte bedrijfsgegevens**, zichtbaar en niet weggestopt.
2. **Een compleet totaalbedrag** vóór de laatste stap.
3. **Betaalmethodes die de markt kent**, met de logo's erbij.
4. **Bedenktijd en retour** duidelijk benoemd.
5. **Beoordelingen**, als ze echt zijn.

Wat niet helpt: keurmerken die je niet hebt, een afteller die nergens over
gaat, "nog 2 op voorraad" als dat niet waar is. Een klant die één leugen
betrapt, gelooft de rest ook niet meer.
