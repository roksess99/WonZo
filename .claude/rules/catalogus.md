---
paths:
  - "src/lib/catalog/**"
  - "tests/**/catalog/**"
---

# Catalogus — de koppeling met de leverancier

Laadt bij werk aan de adapter: de laag tussen een API die je niet in de hand
hebt en een winkel die altijd moet werken. Faalgedrag, timeouts en fixtures:
`docs/SUPPLIER_RESILIENCE.md`. Het meetformulier: `docs/api/LEVERANCIER.md`.

## De keten

```text
leverancier-API
  ↓  HTTP-client (timeout, retry, rate limit, circuit breaker)
adapter          → supplier DTO's (alleen hier)
  ↓  schemavalidatie
mapping          → canoniek Product (src/lib/catalog/types.ts)
  ↓
applicatie       pricing, cart, checkout, orders, UI
```

## De grens is hard

**Supplier DTO's verlaten de adapter niet.** Leverancierspecifieke types,
veldnamen, statuscodes of id-formaten komen niet in:

- UI en componenten
- winkelwagen, checkout, bestellingen
- pricing, discounts, invoices
- de database (behalve als ondoorzichtige `supplierRef`-string en een
  `supplierOfferId` in de bevroren bestelregel)

Componenten en domeinlogica importeren alleen uit `src/lib/catalog/types.ts`.
Afdwingen met een importregel in de linter (`docs/CI_CD.md`), niet alleen met
deze tekst.

**`types.ts` is leidend.** Past de echte API er niet op, dan past de adapter
zich aan — nooit de componenten. Ontbreekt er een veld, dan verandert
`types.ts`, en zie je meteen wat er op vastzit. Verzin geen velden onderweg.

## Server-side, altijd

De browser praat nooit met de leverancier: het token is een secret en de rate
limit geldt voor de hele winkel. Bovenin de adapter een controle die gooit als
hij in een browser draait.

## Schema aan de rand

- Elk antwoord door een schemavalidatie voordat het de code in gaat.
- Numerieke velden die als **string** komen: afdwingen in het schema, niet met
  `Number()` halverwege een berekening. Prijzen gaan via een exacte
  decimaal-naar-centen-conversie, nooit via `parseFloat * 100`.
- **Een artikel dat niet door het schema komt wordt overgeslagen** met een
  logregel en een teller; één kapot artikel sloopt geen categoriepagina. In het
  **geldpad** (checkout, inkoop) is een ongeldig artikel juist een harde fout.
- Een HTTP 200 met een foutcode in de body is een fout. Meet welk van de twee
  de leverancier doet.

## Zonder sleutel blijft de winkel staan

Geen token → de provider gebruikt de mock. Dat is een eis: anders kan niemand
aan de UI werken zonder verbruik bij de leverancier.

De mock is **deterministisch** (geen `Math.random`, geen `Date.now` in data),
**schema-valide** (gaat door dezelfde validatie als echte data), en levert de
fixtures uit `docs/SUPPLIER_RESILIENCE.md`, inclusief de faalscenario's — te
kiezen per test of via een omgevingsvariabele in ontwikkeling.

## Caching

| Soort | Duur | Waarom |
|---|---|---|
| Structuur (categorieën, merken) | uren tot een dag | verandert nauwelijks |
| Prijzen en voorraad voor weergave | minuten | actueel, maar niet per klik |
| Tellingen en aggregaten | een dag | duur om op te halen |
| Prijs en voorraad **in de checkout** | **niet gecachet** | het geldpad haalt vers op |

- **Meet de omvang van antwoorden.** Boven een paar megabyte weigeren sommige
  framework-caches stil (`EERDER WAARGENOMEN`: 4 MB, elke filterklik opnieuw
  opgehaald). Dan een eigen cache in het geheugen ernaast.
- **Een cache mag nooit iets laten doorlopen dat is afgelopen.** Maak de
  sleutel afhankelijk van wat geldig is (actieve acties), niet alleen van tijd.
- Verouderde data tonen tijdens een storing mag, binnen de grenzen van het
  stale-beleid in `docs/SUPPLIER_RESILIENCE.md` — nooit in de checkout.

## Rate limit

- De limiet geldt voor alle bezoekers samen: bundelen, gelijktijdigheid
  begrenzen, en een lijst die iedereen nodig heeft één keer ophalen.
- Tel één keer hoeveel calls een paginaweergave kost. Die meting vindt altijd
  iets.

## Prijs en voorraad

Zie `.claude/rules/geld.md`: **kies één aanbieding en neem alles daarvandaan**,
en geef het id van die aanbieding door aan het canonieke `Product`.

## Identiteit van een artikel

- Het id van de leverancier is de sleutel, in winkelwagen en bestelling — met
  de bron erbij als er meer dan één catalogus is.
- De URL is een leesbare slug mét dat id; een gewijzigde slug leidt om met 308.
- **Leg geen categorie-id's vast in code** zonder gemeten te hebben dat ze
  stabiel zijn (`EERDER WAARGENOMEN`: id's die na een maand naar de groep
  ernaast wezen). Zoek op naam in de boom die je toch ophaalt.

## Twee catalogi

- Elke productgroep weet bij welke bron hij hoort; dat gaat mee in de
  winkelwagen.
- Eén bestelling kan meerdere inkooporders worden; de beheerder ziet dat.
- Twee bronnen, één `Product`.
