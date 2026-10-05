# Retourneren

Een retour is de afwikkeling van dezelfde koop, niet een nieuw geval. Alles wat
hier gebeurt raakt geld, en de wet schrijft een flink deel ervan voor.

Dit beschrijft de Nederlandse situatie (BW boek 6, afdeling 2B — de uitwerking
van Richtlijn 2011/83/EU consumentenrechten). Verkoop je ook buiten Nederland,
kijk dan of je markt afwijkt. Statussen: `docs/STATE_MACHINES.md` § Return en §
Refund.

---

## Wat de wet voorschrijft (`WETTELIJK`, NL — te bevestigen)

Samenvatting voor het ontwerp, geen juridisch advies. Laat de teksten op de
site en in de voorwaarden door een adviseur controleren (D-09).

| Onderwerp | Regel |
|---|---|
| Bedenktijd | **14 dagen** na ontvangst, zonder reden, zonder boete |
| Terugsturen | daarna nog 14 dagen om het pakket te verzenden |
| Terugbetalen | binnen **14 dagen** na de melding — je mag wachten tot het pakket terug is of tot de klant een verzendbewijs stuurt |
| Modelformulier | moet beschikbaar zijn; de klant mag het ook zonder doen |
| Oorspronkelijke verzendkosten | gaan **mee terug** bij volledige herroeping, tot het bedrag van de goedkoopste standaardmethode |
| Retourzending | betaalt de klant, **mits je dat vooraf duidelijk hebt gemeld**. Heb je dat niet, dan betaal jij |
| Waardevermindering | mag in mindering worden gebracht als de klant het artikel verder heeft gebruikt dan nodig om het te beoordelen |
| Terugbetaalwijze | hetzelfde middel als waarmee betaald is, tenzij de klant instemt met iets anders |

**Niet alles valt eronder.** Maatwerk, verzegelde artikelen die geopend zijn om
hygiënische redenen, en snel bederfelijke zaken zijn uitgezonderd. Staat zoiets
in je assortiment, zet de uitzondering dan op de productpagina en niet alleen
in de voorwaarden.

---

## De vier redenen, en wie wat betaalt

De reden is geen administratie: hij bepaalt het bedrag. De tabel combineert
wet (herroeping, non-conformiteit) en `BELEID` (wie de retourzending betaalt
bij een fout van de winkel) — vastleggen in D-09.

| Reden | Verzendkosten heen | Retourzending |
|---|---|---|
| Herroeping (bedenktijd) | terug bij **volledige** herroeping | klant |
| Verkeerd geleverd | terug | **winkel** |
| Beschadigd aangekomen | terug | **winkel** |
| Defect / garantie | terug | **winkel** |

**Bij een gedeeltelijke herroeping gaan de verzendkosten niet mee terug** — de
klant houdt een deel van de bestelling, dus die zending was nodig.

---

## De aanvraag

### Controleren zonder een lek te maken

Een retouraanvraag wordt gecontroleerd op **ordernummer én mailadres**. Een
ordernummer alleen is te raden, en dan leest iemand andermans adres.

**Geef bij elke misser dezelfde melding.** Een verkeerd mailadres bij een
bestaand nummer hoort hetzelfde te antwoorden als een verzonnen nummer —
anders vertelt het formulier welke nummers bestaan.

Wat er verder gecontroleerd wordt:

- Is er **betaald**? Zonder betaling valt er niets terug te boeken.
- Valt de bestelling binnen de termijn?
- Is er al een retour op deze bestelling? **Eén open retour tegelijk**, anders
  leveren twee tabbladen twee terugbetalingen op voor één pakket. Dat hangt aan
  een unieke sleutel of een vergrendelde rij, niet aan een controle in code.

### Wat de klant kiest

- Welke artikelen, en hoeveel ervan. Niet de hele bestelling als standaard:
  een gedeeltelijk retour is het gewone geval.
- De reden, uit de vier hierboven, in gewone woorden.
- Een opmerking, optioneel.

Toon direct wat hij terugkrijgt, met de verzendkosten erbij of eraf volgens de
tabel hierboven. Een bedrag dat pas achteraf blijkt, is een bedrag waarover
gemaild wordt.

---

## De afhandeling

Drie knoppen in volgorde: **ontvangen** → **terugbetalen**, of **afwijzen met
een reden**.

- **Terugbetalen is de enige knop die geld verplaatst.** Dus met een
  bevestiging die het exacte bedrag toont, een reden en een auditregel.
- **Het bedrag wordt server-side berekend** uit de bevroren regels (incl.
  verdeelde code-korting) en eerdere terugbetalingen. Het formulier mag een
  lager bedrag voorstellen (waardevermindering, met reden); hoger nooit.
- **Buiten bereik wordt geweigerd, niet afgekapt.** Zie `.claude/rules/geld.md`.
- **Intent eerst, provider dan, uitkomst daarna**: refund `REQUESTED` met
  `refund.id` als idempotentiesleutel, dan de provider, dan de uitkomst
  (`docs/PAYMENTS.md`).
- **Wat er in de administratie komt is wat de betaaldienst zegt te hebben
  teruggeboekt.** Pas bij `SUCCEEDED` is het retour `REFUNDED`.
- Timeout of onduidelijke uitkomst: refund `UNKNOWN`, eerst opvragen; **niet**
  een tweede refund aanmaken.
- Afwijzen vraagt een reden, en die wordt vastgelegd — en de klant hoort hem.

**Een creditnota hoort erbij**, aangemaakt bij `SUCCEEDED`. Een terugboeking
zonder creditnota klopt niet in de boekhouding; zie `docs/FACTUUR.md`.

---

## Wat de klant ziet

- Een pagina waar hij het aanmeldt, bereikbaar vanuit de voettekst, de
  veelgestelde vragen en de bevestigingsmail.
- Het **retouradres**, ook voor wie het meegestuurde label kwijt is.
- Het modelformulier, of een duidelijke verwijzing ernaartoe.
- Na het aanmelden: wat er nu gebeurt en binnen welke termijn.
- Bij de terugbetaling een mail met het bedrag en de mededeling dat het
  teruggaat naar de rekening waarmee betaald is.

---

## Wat je ook moet regelen

- **De bedenktijd staat op de productpagina en bij de knop**, niet alleen in de
  voorwaarden.
- **In de bevestigingsmail** staat het herroepingsrecht met de termijn.
- De retourpagina en de voorwaarden zeggen hetzelfde. Twee teksten die
  verschillen is erger dan één tekst die ontbreekt.

---

## Controlelijst

- [ ] Ordernummer én mailadres, met dezelfde melding bij elke misser
- [ ] Alleen betaalde bestellingen
- [ ] Eén open retour per bestelling, afgedwongen door de database
- [ ] Gedeeltelijk retour mogelijk, met aantallen
- [ ] Verzendkosten volgens de tabel, en zichtbaar vóór het versturen
- [ ] Terugbetalen met bevestiging en bedrag
- [ ] Het bedrag komt uit de database
- [ ] Wat geboekt is komt van de betaaldienst
- [ ] Creditnota aangemaakt
- [ ] De klant krijgt bericht
