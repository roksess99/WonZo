---
paths:
  - "src/lib/pricing/**"
  - "src/lib/cart/**"
  - "src/lib/checkout/**"
  - "src/lib/payments/**"
  - "src/lib/orders/**"
  - "src/lib/discounts/**"
  - "src/lib/invoices/**"
  - "src/lib/returns/**"
  - "src/app/api/**"
  - "src/components/cart/**"
  - "src/components/checkout/**"
---

# Geld — regels die uit schade komen

Laadt bij werk aan prijzen, winkelwagen, afrekenen, betalingen, bestellingen,
kortingen, facturen en retouren. De bedrijfsregels (prijsopbouw, acties,
codes) staan in `docs/PRIJZEN.md`; dit bestand gaat over **hoe je rekent en
in welke volgorde je handelt**.

## Het geldmodel

**Een bedrag is een integer in de kleinste eenheid, met valuta.** Nooit een
float, nooit een kale integer die "wel euro's zal zijn":

```ts
type Money = { amount: number /* integer, minor units */; currency: string /* ISO 4217 */ };
```

- Rekenen met twee bedragen van verschillende valuta is een fout die gooit.
- `Number.isSafeInteger` aan de rand; een niet-integer bedrag wordt geweigerd.
- Opslag in de database als integer-kolom plus valutakolom (of één vaste valuta
  per tabel, vastgelegd in D-14). Geen `DECIMAL` die als float terugkomt.

**Benoem wat een bedrag is.** Deze vier lopen door elkaar en mogen dat niet:

| Begrip | Betekenis | Bron |
|---|---|---|
| `supplierCost` | Inkoopprijs van de gekozen aanbieding, zoals de leverancier hem rekent (meestal excl. btw) | adapter |
| `landedCost` | Wat één stuk de winkel werkelijk kost: inkoop plus wat het beleid erbij telt (inkomende verzending, betaalkosten, toeslagen) | D-16 |
| `sellingPrice` | Wat de klant betaalt, incl. btw | prijsopbouw |
| `margin` | `sellingPrice` excl. btw − `landedCost` | afgeleid |

**`margin = sellingPrice − supplierCost` is géén universele waarheid.** Zolang
D-16 open staat is `landedCost = supplierCost` een tijdelijke aanname — en zo
staat het ook in de code, met een verwijzing naar D-16.

## Rekenen

- **Reken bruto als je bron bruto is.** Netto → bruto → netto kost een cent.
  Haal de btw er pas uit bij het factureren, met één exacte functie.
- **Rond bewust en één keer af**, met de richting en de reden in commentaar.
  Een getoond percentage rond je naar beneden af.
- **Btw per regel of per tarief over het totaal** is een keuze (D-15). Eén
  functie, gebruikt door pagina, winkelwagen, checkout, mail en factuur.
- **Een orderkorting (code) wordt verdeeld over de regels** voordat er btw
  wordt berekend: proportioneel, met een deterministische restverdeling
  (D-15). Zonder verdeling klopt de btw per tarief niet.
- **Verzendkosten** krijgen hun btw volgens D-15; niet "altijd het hoogste
  tarief" als aanname.
- **Nul is een geldig totaal** (bijvoorbeeld een volledig vergoede
  vervanging); de betaalstap wordt dan overgeslagen via een expliciete
  transitie, niet door een betaling van € 0,00 te proberen.
- **Negatief is nooit een totaal.** Een korting die het totaal onder nul
  brengt wordt begrensd door de regels in `docs/PRIJZEN.md`; komt er toch een
  negatief totaal uit, dan gooit de berekening.

## Wat de browser mag meesturen

**Een bedrag dat naar de betaaldienst gaat komt nooit uit de browser.** De
browser stuurt hoogstens artikel-id, aantal en de tekst van een kortingscode.
Naam, prijs, voorraad, korting, verzendkosten en btw rekent de server opnieuw
uit, bij elk verzoek. Het bedrag voor de betaaldienst komt uit de **bevroren
snapshot** van de bestelling.

## Prijs en voorraad

- **Prijs en voorraad komen van dezelfde aanbieding.** Meerdere verkopers: kies
  er één — de goedkoopste **mét** voorraad — en neem prijs, voorraad en
  levertijd daarvandaan. Leg het id van die aanbieding vast in de bestelregel;
  anders koopt de eigenaar bij een andere verkoper in dan waarmee gerekend is.
- **Begrens het aantal op die voorraad.**
- **De ondergrens gaat vóór het percentage.** Reken korting uit waar de
  kostprijs nog in beeld is. Formule en voorbeelden: `docs/PRIJZEN.md`.
- **Geef terug wat werkelijk is toegepast**, niet wat gevraagd was.

## Buiten bereik: weigeren, niet afkappen

Een **invoerwaarde** buiten het toegestane bereik wordt geweigerd met een
melding. Een getypte "-5" die door `Math.max(1, …)` een terugboeking van één
cent werd, zette een retour op "terugbetaald" — waarna de rest niet meer
doorheen kon (`EERDER WAARGENOMEN`).

Dit is iets anders dan de **ondergrens van een actie**: een geldig percentage
(bijv. 20%) dat bij één artikel op de kostprijs stuit, wordt voor dat artikel
begrensd en het paneel zegt dat. Ongeldige invoer: weigeren. Geldige invoer die
per artikel een grens raakt: begrenzen en zichtbaar maken.

## Volgorde bij alles wat geld verplaatst

**Intent eerst, provider dan, uitkomst daarna.** Volledig uitgewerkt in
`docs/PAYMENTS.md`; de kern:

1. **Leg de intentie vast** in de database, met een idempotentiesleutel en
   status `PENDING`/`REQUESTED`, vóór de externe call. Zo laat een crash altijd
   een spoor achter dat reconciliatie kan oppakken.
2. **Roep de provider aan met diezelfde idempotentiesleutel** — je eigen
   referentie, niet een willekeurig getal per poging.
3. **Schrijf weg wat de provider zegt**, niet wat het formulier vroeg. Met een
   idempotentiesleutel krijgt een tweede poging met een ánder bedrag de
   éérste boeking terug.
4. **Markeer pas als geslaagd na bevestiging van de provider.** Een mislukte
   terugboeking die als "terugbetaald" in de boeken staat is precies de fout
   die dit voorkomt.
5. **Timeout of onbekende uitkomst = status `UNKNOWN`**, niet "mislukt" en niet
   "opnieuw proberen met een nieuwe sleutel". Reconciliatie vraagt de echte
   stand op.

## Terugbetalingen

- **Vertrouw nooit het bedrag uit de browser.** Het formulier mag een bedrag
  voorstellen; de server herberekent het maximum uit de bevroren regels en de
  eerdere terugbetalingen, en weigert alles erboven.
- Controleer de status van order en betaling vóór de call (`docs/STATE_MACHINES.md`).
- Som van alle terugbetalingen ≤ betaald bedrag — afgedwongen in een transactie
  met een vergrendelde rij, niet met een controle in code.
- Elke terugbetaling: bevestiging met exact bedrag, reden, auditregel,
  idempotentiesleutel = id van het terugbetaal-record.

## Gelijktijdigheid

Twee verzoeken tegelijk is geen randgeval maar twee tabbladen. **Laat de
database het uitmaken**: een unieke sleutel waar dat kan, anders een
transactie met een vergrendelde rij. Geldt voor factuurnummers, "één keer per
klant", "er loopt al een retour", terugbetaalsom en elke teller.

## Nummers en toegang

- **Factuurnummers** uit een teller in de database, in dezelfde transactie als
  de factuur. Wettelijke eis en beleid: `docs/FACTUUR.md`.
- **Een ordernummer mag raadbaar zijn, een sleutel niet.** Toegang zonder
  account gaat met een apart, willekeurig token (gehasht opgeslagen), en bij
  een misser dezelfde melding als bij een niet-bestaand nummer.

## Bestellingen

- **De bevestiging hangt aan de betaalstatus**, niet aan de terugkeerpagina.
- **Neveneffecten (mail, factuur, melding) via een outbox**, in dezelfde
  transactie als de statusovergang geschreven en daarna verwerkt. Een
  mislukte mail gooit de bestelling niet om en verdwijnt ook niet.
- **Bewaar wat de klant zag**: prijs, korting, btw, valuta en aanbieding in de
  bestelregel. De catalogus van morgen is geen bewijs van gisteren.
