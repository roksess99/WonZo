# BigBuy — integratienotities

Bron: `BigBuy API — OpenAPI 3.0.0 (doc.json, info.version 1.0.0)`, aangeleverd
2026-10-04 door de eigenaar. Het bestand staat buiten het project
(`Downloads/Big Buy/doc.json`); de waarden hieronder zijn `GEDOCUMENTEERD`,
niet gemeten.

| Wat | Waarde |
|---|---|
| Host | `api.bigbuy.eu` (productie); `api.sandbox.bigbuy.eu` (testomgeving) |
| Base path | `/rest` — paden eindigen op `.{format}` (`json` of `xml`) |
| Auth | `Authorization: Bearer <API-sleutel>` → `SUPPLIER_API_TOKEN` |
| Rate limit | **per endpoint**: bulklijsten 2–24 per uur (producten, prijzen, voorraad, afbeeldingen: 10 per uur), één artikel 1 per 5 s, bestellen en tracking 1 per s — geldt voor de héle winkel (zie § Rate limits) |
| Formaat | JSON / XML. Let op welke numerieke velden als **string** terugkomen |

**Dit bestand is een invulformulier.** Elk antwoord krijgt het woord
`GEMETEN` met de datum, de omgeving en de waarneming (formaat in
`docs/AUTHORITY.md`). Wat niet gemeten is, is een aanname — en aannames over
een leveranciers-API kosten meer tijd dan het bouwen zelf. De lessen met
`EERDER WAARGENOMEN` komen van een andere leverancier: ze zeggen wat je moet
meten, niet wat je zult vinden.

Supplier-specifieke details uit dit formulier horen in de adapter en hier —
nooit in de rest van de documentatie of de code daarbuiten.

**Meten** doet de eigenaar, met de sleutel in `.env` (Claude leest die niet):
`node --env-file=.env scripts/measure-supplier.mjs`. Het script werkt
standaard alleen tegen de sandbox, plaatst nooit een bestelling, en geeft een
samenvatting per vraag die in het gesprek geplakt kan worden. Niet vaker dan
eens per uur draaien (rate limits).

---

## 1. Werkt het token, en op welk platform?

Veel groothandels draaien per land een eigen platform met een eigen base path.
Taal, assortiment én beschikbaarheid van endpoints kunnen per platform
verschillen.

- [ ] Token werkt op productie én op de sandbox (BigBuy heeft geen platform per land)
- [ ] Welke platformen bestaan er, en welke geven JSON (en niet stilletjes een
      HTML-pagina)?
- [ ] Is er een testomgeving, of is alles live?

GEMETEN 2026-10-05 — Omgeving: sandbox (`api.sandbox.bigbuy.eu`), sandbox-sleutel van de eigenaar, `scripts/measure-supplier.mjs`.
Waarneming: `auth/status` geeft HTTP 200 met een lege body (1640 ms): het
token werkt op de sandbox. Een ongeldig token geeft HTTP 401
`{"message":"Invalid Token"}`. Productie: nog niet gemeten.

GEMETEN 2026-10-05 — Omgeving: productie (`api.bigbuy.eu`), productiesleutel van de eigenaar, alleen lezen (`scripts/measure-supplier.mjs --production`, 08:34 UTC).
Waarneming: het productietoken werkt (`auth/status` HTTP 200, 203 ms).
Sandbox en productie hebben elk een eigen sleutel. De sandbox heeft geen
productcatalogus (§ 2); productie wel.

GEDOCUMENTEERD (BigBuy API, OpenAPI 3.0.0 `doc.json`, geraadpleegd 2026-10-04): één API voor alle landen —
geen platform per land; de taal kies je per call met `isoCode` (standaard
`es`). Er is een testomgeving (`api.sandbox.bigbuy.eu`). Controle van het
token: `GET /rest/user/auth/status.json`. Of het token in productie én
sandbox werkt en wat de sandbox teruggeeft: meten.

---

## 2. Hoe blader je door het assortiment?

- [ ] Is er een categorieboom? Hoe diep?
- [ ] Zijn de categorie-id's **stabiel over de tijd**?

> Reken daar niet op. `EERDER WAARGENOMEN`: nummers die in september waren
> vastgelegd wezen een maand later naar de groep ernaast. Dat is stil kapot — geen fout, de link
> werkt, hij wijst alleen naar iets anders. **Leg dus geen id's vast in code**
> als je ze niet hebt gecontroleerd; zoek de groep op naam op in de boom die je
> toch al ophaalt.

- [ ] Kun je artikelen opvragen **zonder** eerst iets anders te kiezen?

> Dit bepaalt of je een "alle artikelen"-pagina, een aanbiedingenlijst en een
> nachtelijke prijsmeting kunt bouwen. Kan het niet, dan is dat geen detail
> maar een vorm die je hele navigatie bepaalt.

GEMETEN 2026-10-05 — Omgeving: sandbox (`api.sandbox.bigbuy.eu`), sandbox-sleutel van de eigenaar, `scripts/measure-supplier.mjs`.
Waarneming: `taxonomies?isoCode=nl&firstLevel=1` geeft 24 hoofdgroepen met
Nederlandse namen (bijv. 19648 "Eten en drinken", 19649 "Baby", 19650
"Schoonheid"); de id's zijn bewaard voor een vergelijking bij een volgende
run. **Elke productlijst zonder `parentTaxonomy` gaf HTTP 400**
`{"code":400,"message":"Bad request"}` — `products`, `productprices`,
`productsstockbyhandlingdays`, `productsimages`, `productsinformation`. Of
`parentTaxonomy` in de praktijk verplicht is (tegen de documentatie in), of
dat de sandbox geen catalogus heeft: volgende meting.

GEMETEN 2026-10-05 (tweede run, 08:26 UTC) — zelfde omgeving.
Waarneming: **ook mét `parentTaxonomy=19653` ("Elektronica") gaf elke
productlijst HTTP 400** — met paginering (`page=0&pageSize=10`) én zonder.
Het was geen limiet: de run viel vóór de reset (08:52 UTC) en het antwoord was
400, geen 429. De taxonomie-id's waren gelijk aan de eerste run (zelfde dag,
dus nog geen bewijs van stabiliteit). Conclusie (`AANNAME`): **de sandbox heeft
geen productcatalogus**, of het account heeft er geen toegang toe. De
catalogus wordt in productie gemeten, alleen lezen
(`node --env-file=.env scripts/measure-supplier.mjs --production`).

GEMETEN 2026-10-05 — Omgeving: productie (`api.bigbuy.eu`), productiesleutel van de eigenaar, alleen lezen (`scripts/measure-supplier.mjs --production`, 08:34 UTC).
Waarneming:
- **22 hoofdgroepen** in het Nederlands (de sandbox had er 24, met deels
  andere id's — sandbox en productie zijn niet uitwisselbaar). Hoofdgroepen:
  17088 Seks en sensualiteit, 19648 Eten en drinken, 19649 Baby, 19650
  Schoonheid, 19651 Doe-het-zelf en gereedschap, 19652 Auto en motor, 19653
  Elektronica, 19654 Bagage, 19656 Huis en koken, 19657 Verlichting, 19658
  Industrie, bedrijven en wetenschap, 19661 Tuin, 19662 Sieraden, 19663
  Speelgoed en games, 19664 Kantoorartikelen en schrijfwaren, 19666
  Dierproducten, 19667 Klokken, 19668 Kleding, 19669 Gezondheid en
  persoonlijke verzorging, 19671 Schoenen en accessoires, 19685 "Berekenen"
  (vermoedelijk een vertaling van *computing*), 19756 Sport en outdoor.
  Relevant voor D-02: er is een hoofdgroep voor volwassenen.
- **Met `parentTaxonomy` werken de productlijsten** (HTTP 200). Een product
  draagt zijn eigen, diepere `taxonomy` (bijv. 21319) naast de hoofdgroep.
- Zonder `parentTaxonomy` in productie: nog niet gemeten (de sandbox weigerde
  het, maar had helemaal geen catalogus).
- Stabiliteit van de id's over de tijd: nog niet gemeten (één dag).

GEMETEN <<DATUM>>: <<ANTWOORD>>

GEDOCUMENTEERD (BigBuy API, OpenAPI 3.0.0 `doc.json`, geraadpleegd 2026-10-04): categorieën heten `taxonomies`
(`/rest/catalog/taxonomies`, met `firstLevel`; `categories` is verouderd).
Productlijsten nemen een optionele `parentTaxonomy`; de documentatie zegt
niet dat die verplicht is, dus bladeren zonder keuze lijkt mogelijk — meten.
Stabiliteit van taxonomie-id's: niet gedocumenteerd.

---

## 3. Zoeken

- [ ] Op naam? In welke taal?
- [ ] Op artikelnummer, EAN, fabrikantsnummer?
- [ ] Werkt zoeken zonder de rest van de context (categorie, voertuig, …)?
- [ ] Hoe nauwkeurig is het? Zoek op een term en kijk wat er bovenaan staat.

> Zoeken zonder context haalt rommel naar boven. `EERDER WAARGENOMEN`: een
> gebruikelijke zoekterm gaf als eerste treffer een onderdeeltje van € 0,28. Als je zoekresultaten ergens
> prominent toont, heb je een ondergrens of een naamfilter nodig.

GEMETEN <<DATUM>>: <<ANTWOORD>>

GEDOCUMENTEERD (BigBuy API, OpenAPI 3.0.0 `doc.json`, geraadpleegd 2026-10-04): **er is geen zoek-endpoint.** Alleen
opvragen op id of op sku (`productinformationbysku/{sku}`). Zoeken op naam of
EAN moet dus op een eigen kopie van de catalogus gebeuren.

---

## 4. Paginering

- [ ] Begint de telling bij 0 of bij 1?
- [ ] Wat is het maximum per pagina, en wat gebeurt er als je meer vraagt?
- [ ] Kun je twee verzoeken tegelijk doen?

> `EERDER WAARGENOMEN`: twee gelijktijdige verzoeken op dezelfde categorie met het
> maximum gaven bij één van de twee een HTTP 500 — en de adapter ving dat op met
> een lege lijst, dus de halve categorie verdween zónder foutmelding. Haal
> pagina's sequentieel op tot je het tegendeel gemeten hebt.

GEMETEN 2026-10-05 — Omgeving: sandbox (`api.sandbox.bigbuy.eu`), sandbox-sleutel van de eigenaar, `scripts/measure-supplier.mjs`.
Waarneming: `page=0` en `page=1` met `pageSize=10` (en `pageSize=1000`)
gaven allebei HTTP 400 zonder `parentTaxonomy` (zie § 2). Telling 0 of 1:
nog niet vast te stellen.

GEMETEN 2026-10-05 — Omgeving: productie (`api.bigbuy.eu`), productiesleutel van de eigenaar, alleen lezen (`scripts/measure-supplier.mjs --production`, 08:34 UTC).
Waarneming: `page=0` en `page=1` met `pageSize=10` geven elk 10 verschillende
producten (geen overlap): **`page=0` is de eerste pagina**. Twee verzoeken
tegelijk: niet gemeten (de lessen uit § 4 gelden tot het tegendeel blijkt:
sequentieel ophalen).

GEMETEN 2026-10-05 — Omgeving: productie, alleen lezen, `scripts/explore-catalog.mjs` (eerste versie), 09:21 UTC.
Waarneming: **de lijsten `products`, `productsstockbyhandlingdays` en
`productsinformation` geven hun pagina's niet in dezelfde volgorde.** In
"Huis en koken" (meer dan 10 000 producten) kwam op pagina 0 van de namen
voor geen enkel product van pagina 0 van de producten een naam terug. Koppel
lijsten dus altijd op product-id over álle pagina's, nooit per pagina.

GEMETEN <<DATUM>>: <<ANTWOORD>>

GEDOCUMENTEERD (BigBuy API, OpenAPI 3.0.0 `doc.json`, geraadpleegd 2026-10-04): `page` en `pageSize`, beide met
"Default 0"; maximum 10000 per pagina bij `/products` en `/new-products`. Of
`pageSize=0` "alles" of "niets" betekent, en of tellen bij 0 of 1 begint:
meten.

---

## 5. Hoe groot is een antwoord?

- [ ] Meet de omvang bij het maximale aantal per pagina.

> Boven een paar megabyte weigeren sommige caches stilletjes. `EERDER WAARGENOMEN`:
> een antwoord van 4 MB was te groot voor de cache van het framework, waardoor
> élke filterklik opnieuw vier megabyte ophaalde. Als dat zo is: een eigen cache
> van een paar minuten in het geheugen.

GEMETEN 2026-10-05 — Omgeving: productie (`api.bigbuy.eu`), productiesleutel van de eigenaar, alleen lezen (`scripts/measure-supplier.mjs --production`, 08:34 UTC).
Waarneming: `pageSize=1000` in één hoofdgroep: **809 223 bytes in 2,2 s**,
ongeveer 0,8 kB per product. Bij het maximum van 10 000 per pagina dus rond de
8 MB per antwoord — te groot voor een framework-cache; de kopie van de
catalogus (D-31) hoort in een eigen opslag.

---

## 6. Prijzen

- [ ] Welk veld is de **inkoopprijs**, en is die inclusief of exclusief btw?
- [ ] Welk veld is de **adviesprijs**, en is die inclusief of exclusief btw?
- [ ] Komen ze als getal of als string terug?
- [ ] Zijn er meerdere prijsblokken per verkoper (staffel, vracht, borg)?

> **Controleer dit tegen een schermafdruk van het platform zelf.** De aanname
> dat beide bedragen op dezelfde basis staan kostte eerder weken met 21% te
> hoge prijzen. De gangbare conventie: inkoop tussen bedrijven is netto, een
> adviesprijs voor de consument is bruto. Maar meet het.

GEMETEN 2026-10-05 — Omgeving: productie (`api.bigbuy.eu`), productiesleutel van de eigenaar, alleen lezen (`scripts/measure-supplier.mjs --production`, 08:34 UTC).
Waarneming:
- Bedragen komen als **getal met twee decimalen** in de lijst
  (`productprices`, `products`) én bij één product (`product/{id}`) — de
  documentatie noemde een string; gemeten is een getal. Exact naar centen
  omzetten blijft nodig (geen `parseFloat * 100`).
- Voorbeelden: sku V0710266 — `wholesalePrice` 18.22, `retailPrice` 55.79,
  `inShopsPrice` 74.38, `taxRate` 21; V0710254 — 35.72 / 117.63 / 226.21;
  V0710248 — 25.61 / 85.23 / 190.95. Advies gedeeld door inkoop: 3,06–3,33.
  De verhouding `inShopsPrice`/`retailPrice` wisselt (1,33–2,24): wat
  `inShopsPrice` is, is onduidelijk.
- `priceLargeQuantities` leeg en `canon` `null` in de steekproef.
- **Incl. of excl. btw:** zie de meting hieronder.

GEMETEN 2026-10-05 — Omgeving: BigBuy-account van de eigenaar, productpagina
van V0710266 (schermafdruk van de eigenaar).
Waarneming:
- "DP — Distributeur prijs" **18,22 €** = `wholesalePrice`; "AVP — Adviesprijs"
  **55,79 €** = `retailPrice`; "Marge — Verdien tot: 67 %". Onder het hele
  prijsblok: "*Exclusief belastingen. Verzendkosten zijn alleen inbegrepen
  voor producten met gratis verzending."
- **Inkoopprijs (`wholesalePrice`) is exclusief btw** — vastgesteld.
- **Adviesprijs (`retailPrice`): vermoedelijk óók exclusief btw**, maar dat is
  een `AANNAME`. Wat ervoor pleit: de voetnoot staat onder het hele blok, en
  BigBuy rekent de marge rechtstreeks op beide bedragen
  ((55,79 − 18,22) / 55,79 = 67 %); als de adviesprijs incl. 21 % btw was,
  zou de echte marge 60 % zijn. Wat ertegen pleit: een adviesprijs voor de
  consument is gebruikelijk incl. btw, en de voetnoot zegt het niet per
  bedrag. **Laten bevestigen door BigBuy** (`docs/api/VRAGEN.md` vraag 1).
- Gevolg zolang het niet bevestigd is: een verkoopprijs afleiden van
  `retailPrice` kan 21 % te laag uitvallen — precies de fout uit het vorige
  project, andersom. Raakt D-03.
- `inShopsPrice` (74,38) staat niet op de pagina; wat het is blijft onduidelijk.
- Verzendkosten zitten niet in de inkoopprijs (behalve bij gratis verzending).

GEDOCUMENTEERD (BigBuy API, OpenAPI 3.0.0 `doc.json`, geraadpleegd 2026-10-04): velden `wholesalePrice`
(inkoop), `retailPrice` (advies), `inShopsPrice`, `priceLargeQuantities`
(staffel, met `includePriceLargeQuantities`), `taxRate`/`taxId` en `canon`
(een heffing). `wholesalePrice` en `retailPrice` zijn een **string** in
`/product/{id}` en een **getal** in `/productprices` — twee vormen voor
hetzelfde veld. Incl. of excl. btw staat nergens: meten, met schermafdruk.

---

## 7. Voorraad — de duurste vraag van allemaal

- [ ] Staat er voorraad op het **artikel** of op de **aanbieding van een
      verkoper**?
- [ ] Als beide: komen die overeen?

> **`EERDER WAARGENOMEN`: níet, en dat kostte geld.** Het voorraadgetal bovenin het artikel
> kwam bij de helft van de artikelen niet overeen met de verkopers eronder, en
> was soms een veelvoud: één artikel meldde 2741 stuks terwijl twintig
> verkopers samen 981 hadden en de goedkoopste er één had.
>
> Gevolg: de winkel toonde de prijs van verkoper A en de voorraad van het hele
> platform. Wie vier stuks bestelde kon er één tegen die prijs krijgen en moest
> de rest duurder inkopen — gemiddeld € 60 verschil per set van vier, te
> betalen door de winkel.
>
> **De regel die daaruit volgt:** kies één aanbieding — de goedkoopste mét
> voorraad — en neem prijs, voorraad en levertijd allemaal daarvandaan. Begrens
> het aantal dat een klant kan bestellen op die voorraad.

GEMETEN 2026-10-05 — Omgeving: productie (`api.bigbuy.eu`), productiesleutel van de eigenaar, alleen lezen (`scripts/measure-supplier.mjs --production`, 08:34 UTC).
Waarneming:
- Alle 50 producten in de steekproef (Elektronica) staan in **één magazijn**
  (`warehouse` 1), met **twee voorraadregels**: één met 0–1 dag
  verwerkingstijd en één met 1–2 dagen.
- **Maar 2 van de 50 hebben voorraad** (bijv. 10 stuks met 0–1 dag). De
  catalogus bevat veel artikelen zonder voorraad: zonder voorraadfilter is de
  winkel grotendeels onverkoopbaar.
- De vraag "van welke verkoper" wordt hier: welke van de twee regels — en de
  levertijd van die regel. Prijs en voorraad komen van dezelfde partij.

GEMETEN 2026-10-05 — Omgeving: productie, alleen lezen, `scripts/explore-catalog.mjs` (eerste versie), 09:21 UTC.
Waarneming: in de groepen die in één pagina passen (koppeling volledig) heeft
**ongeveer 1 % van de producten voorraad**: Tuin 54 van 6194, Verlichting 28
van 2809, Bagage 24 van 1583.

GEMETEN 2026-10-05 — productie, `scripts/explore-catalog.mjs` (tweede versie,
alle pagina's, koppeling op id) en een controle door de eigenaar in het
BigBuy-account.
Waarneming:
- **De voorraad uit de API klopt met het account**: vijf artikelen zonder
  voorraad volgens de API (D1400967, S7926708, S7923248, S7191227, S7910989)
  hebben in het account ook geen voorraad; twee met voorraad (D1401142,
  V0104070) wel.
- De lage voorraad komt **niet** door inactieve artikelen of varianten: in
  Tuin, Verlichting en Bagage is elk artikel `active`, en maar 5, 16 en 3
  artikelen hebben varianten.
- Conclusie: **ongeveer 1 % van de catalogus is op een gegeven moment
  leverbaar.** Het aanbod van WonZo is dus klein en wisselend, en voorraad
  verandert snel (bijv. een parasol met 1 stuk). Gevolgen: alleen artikelen
  met voorraad tonen (D-02), voorraad vaak verversen en vers controleren bij
  het afrekenen (D-31, D-22).
- Over acht hoofdgroepen (132 582 producten): 1 044 nieuw en op voorraad. Van
  de kandidaten heeft 75 % maar 1–4 stuks; diepe voorraad (≥ 20) is vooral
  InnovaGoods. Alle leverbare kandidaten: 0–1 dag verwerkingstijd. Details en
  analyse: `docs/ONDERZOEK.md` § 6.
- **Varianten:** in Sport en outdoor hebben 5152 producten varianten en maar
  5646 een voorraadregel; de voorraad per variant
  (`productsvariationsstockbyhandlingdays`) is nog niet gemeten.

GEMETEN <<DATUM>>: <<ANTWOORD>>

GEDOCUMENTEERD (BigBuy API, OpenAPI 3.0.0 `doc.json`, geraadpleegd 2026-10-04): BigBuy is zelf de enige verkoper,
dus prijs en voorraad komen van dezelfde partij. Maar de voorraad staat **per
magazijn**, met `minHandlingDays`/`maxHandlingDays` per regel
(`productsstockbyhandlingdays`). De vraag verschuift: van welk magazijn —
met welke levertijd — reken je, en tel je magazijnen op? Varianten hebben
eigen prijs- en voorraad-endpoints.

---

## 8. Foto's

- [ ] Komt er een bruikbare URL mee, of een plaatshouder met een formaatcode?
- [ ] Zijn de foto's echt, of voor elke categorie hetzelfde generieke bestand?

> Dat laatste komt vaker voor dan je denkt. `EERDER WAARGENOMEN`: een categorie-API
> gaf voor élke categorie exact hetzelfde bestand van 1789 bytes. Controleer de omvang
> van een paar foto's voordat je ze in je ontwerp opneemt.

- [ ] Van welk domein komen ze? Dat domein komt in je HTML te staan, in
      `og:image` en in de zoekmachinemarkering. Wil de eigenaar de naam van
      zijn leverancier niet weggeven, dan moeten de foto's via het eigen
      domein lopen.

- [ ] Wat geven `productcompliance/{id}` en de afbeeldingen met de vlaggen
      `energyEfficiency`, `gpsrLabel` en `gpsrWarning`? Genoeg voor het
      energielabel en de GPSR-informatie (D-34)?

GEMETEN 2026-10-05 — Omgeving: productie (`api.bigbuy.eu`), productiesleutel van de eigenaar, alleen lezen (`scripts/measure-supplier.mjs --production`, 08:34 UTC).
Waarneming:
- 18 foto's bij 10 producten, allemaal van **`cdnbigbuy.com`**; JPEG,
  42–112 kB, verschillend van grootte (geen generieke plaatshouder). Dat
  domein komt in de HTML te staan tenzij de foto's via het eigen domein lopen.
- **GPSR:** `productcompliance` geeft voor V0710266 de fabrikant (naam,
  adres, land, e-mail, website, telefoon — Gigaset Communications GmbH,
  Duitsland); `imagesLabel`, `imagesWarning`, `safetyWarnings` en
  `productComplianceDocuments` waren leeg voor dit artikel.
- **Energielabel:** de vlag `energyEfficiency` stond bij geen van de 18 foto's
  aan — maar de steekproef bevatte accessoires zonder energielabel. Meten op
  een artikel dat er wel een moet hebben (bijv. een koelkast of tv).

GEMETEN 2026-10-05 — Omgeving: productie, alleen lezen, `scripts/explore-catalog.mjs` (eerste versie), 09:21 UTC.
Waarneming: van 20 steekproeven `productcompliance` op artikelen met voorraad
gaven er **7 HTTP 404** (geen GPSR-gegevens; in "Sport en outdoor" alle 3),
13 gaven de fabrikant met adres en e-mail. Niet elk artikel heeft dus de
verplichte GPSR-informatie (D-34).

GEMETEN <<DATUM>>: <<ANTWOORD>>

GEDOCUMENTEERD (BigBuy API, OpenAPI 3.0.0 `doc.json`, geraadpleegd 2026-10-04): `productsimages` geeft per foto een
`url`, `isCover`, `position` en vlaggen (`logo`, `whiteBackground`,
`energyEfficiency`, `gpsrLabel`, `gpsrWarning`). Het domein van de URL's en
de echtheid van de foto's: meten.

---

## 9. Taal en namen

- [ ] In welke talen komen artikelnamen en eigenschappen?
- [ ] Is er een Engels platform?

> Is die er niet, dan is dat niet met een woordenlijst op te lossen: het gaat
> om miljoenen vrije-tekstvelden van honderden fabrikanten. De anderstalige
> pagina's tonen dan productnamen in de taal van de leverancier. Besluit dat bewust
> en zet het in DECISIONS, anders gaat iemand het later "repareren".

GEMETEN 2026-10-05 — Omgeving: sandbox (`api.sandbox.bigbuy.eu`), sandbox-sleutel van de eigenaar, `scripts/measure-supplier.mjs`.
Waarneming: `languages` geeft 24 talen, **`nl` is er één van**; de
taxonomieën komen in het Nederlands terug. Productnamen in het Nederlands:
nog niet gemeten (de lijst gaf HTTP 400, zie § 2).

GEMETEN 2026-10-05 — Omgeving: productie (`api.bigbuy.eu`), productiesleutel van de eigenaar, alleen lezen (`scripts/measure-supplier.mjs --production`, 08:34 UTC).
Waarneming: `productsinformation?isoCode=nl` geeft 10 van 10 producten met een
Nederlandse naam — deels gemengd ("Retro Videogame Silicone Case voor iPhone").
De omschrijving bevat **HTML** (`<b>`) en een standaard verkooptekst ("Als je
een fan bent van IT en elektronica … koop … tegen een o…"): ontsmetten
(`.claude/rules/beveiliging.md`) en de toon botst met `docs/BRAND.md`.

GEDOCUMENTEERD (BigBuy API, OpenAPI 3.0.0 `doc.json`, geraadpleegd 2026-10-04): `productsinformation` en
`taxonomies` nemen `isoCode` (standaard `es`); de talenlijst komt uit
`/rest/catalog/languages`. Of `nl` erbij zit en hoe volledig: meten.

---

## 10. Bestellen

- [ ] Kan het via de API? Welke stappen?
- [ ] Is er een overeenkomst of vrijgave nodig per groothandel?
- [ ] Wat gebeurt er bij een aantal dat niet op voorraad is?
- [ ] Wordt een bestelling met artikelen van twee verkopers **twee**
      bestellingen?
- [ ] Ondersteunt de bestel-call een **idempotentiesleutel** of een eigen
      referentie waarop je kunt terugzoeken? Zo niet: hoe stel je na een
      timeout vast of de bestelling is aangekomen? (`docs/IDEMPOTENCY.md`)
- [ ] Hoe meldt de leverancier verzending en tracking: webhook, polling, mail?

> ⚠️ **De call die echt bestelt plaatst een echte, factureerbare bestelling.**
> Draai hem nooit "even ter controle". Zet hem achter een aparte sleutel en
> geef hem een idempotentiesleutel. (BigBuy kent geen aparte sleutel; het
> meetscript weigert de bestel-call in de code.)

GEMETEN 2026-10-05 — Omgeving: sandbox (`api.sandbox.bigbuy.eu`), sandbox-sleutel van de eigenaar, `scripts/measure-supplier.mjs`.
Waarneming:
- Tegoed (`user/purse`): HTTP 200, body `"10000.00"` — een **string** met
  twee decimalen, niet een getal (exact naar centen omzetten).
- Vervoerders (`shipping/carriers`): HTTP 200, **lege lijst** in de sandbox.
  Een `order/check` kan daardoor in de sandbox falen op "geen vervoerders".
- **Opzoeken van een eigen referentie die niet bestaat gaf HTTP 500**
  `{"code":500,"message":"An error has occurred. Please try again later. …"}`
  (1771 ms), géén 404. Gevolg: na een timeout bewijst een fout bij het
  opzoeken níet dat de bestelling niet is aangekomen. Een inkooporder blijft
  dan `UNKNOWN`; nooit opnieuw versturen (`docs/IDEMPOTENCY.md`).
- `order/check` niet uitgevoerd: geen product met voorraad gevonden (de
  voorraadlijst gaf HTTP 400).

GEMETEN 2026-10-05 — Omgeving: productie (`api.bigbuy.eu`), productiesleutel van de eigenaar, alleen lezen (`scripts/measure-supplier.mjs --production`, 08:34 UTC).
Waarneming:
- **Tegoed (`moneybox`) in productie: `"0.00"`.** Automatisch inkopen (D-04)
  mislukt tot er tegoed op staat.
- **Opzoeken van een onbekende eigen referentie geeft in productie HTTP 404**
  `{"code":404,"message":"No order found with refOrder: …"}` (94 ms). Daarmee
  is na een timeout wél vast te stellen dat een bestelling níet aankwam. De
  HTTP 500 was een eigenschap van de sandbox.
- **Vervoerders naar Nederland:** SEUR, TNT en "Standard Shipment"; elke dienst
  heeft een levertijd als tekst ("1-2 dagen" … "6-10 dagen") en `pod`
  (afleverbewijs). Per vervoerder een lijst landen (NL erbij) en
  uitgesloten categorieën. Levertijd aan de klant = verwerkingstijd (§ 7) plus
  de dienst.
- Productgegevens: **gewicht en afmetingen staan op `1`** bij het gemeten
  product — plaatshouders, niet bruikbaar voor verzendkosten.
- **`condition`: `"REFURBISHED_B"`** bij het gemeten product: BigBuy verkoopt
  ook gereviseerde artikelen. Tonen of uitsluiten is D-02.
- `order/check` niet uitgevoerd (productie is alleen lezen; de sandbox heeft
  geen catalogus en geen vervoerders).

GEMETEN 2026-10-05 — Omgeving: productie, sleutel van de eigenaar, alleen
lezen (`scripts/measure-shipping.mjs`, gedraaid door de eigenaar).
Waarneming — **verzendkosten naar Nederland per product, los verzonden**
(`GET /rest/shipping/lowest-shipping-costs-by-country/nl`):
- Eén antwoord voor de hele catalogus: 322 683 regels, 25,9 MB, 16,7 s.
  `cost` is een **string** ("14.02"); per regel ook vervoerder en id. Of het
  bedrag incl. of excl. btw is, staat er niet bij.
- Van de 382 artikelen die door de selectieregel komen (D-02, zonder
  GPSR-controle) hadden er 381 een bedrag. **Laagste € 8,58, mediaan € 8,63**,
  75 % € 14,89, 90 % € 25,55, hoogste € 309,86. Vervoerders: SEUR (345), TNT
  (36).
- **Kleine artikelen** (decoratie, keuken, opslag, dieren, bewatering,
  barbecue-accessoires): mediaan € 8,58. **Meubels**: mediaan € 63,80,
  90 % € 273,25. **Tuinmeubels**: mediaan € 20,27, 90 % € 114,27.
- Naar prijsklasse (adviesprijs, btw-basis nog niet bevestigd): onder € 15 —
  164 artikelen, verzending is mediaan **134 % van de prijs**; € 15–25 — 51 %;
  € 25–50 — 34 %; € 50–100 — 25 %; boven € 100 — 18 %.
- Eén artikel alleen kost dus al gauw meer om te verzenden dan het zelf kost.

Waarneming — **verzendkosten van een mand** (`POST /rest/shipping/orders`,
een kostenberekening zonder bestelling, naar 6846XX, zelfde dag):

| Mand | Som los | Mand | Gewicht (kg) |
|---|---|---|---|
| 1 klein artikel | € 8,58 | € 8,58 | 0,73 |
| zelfde artikel 2× | € 17,16 | € 8,58 | 1,46 |
| zelfde artikel 3× | € 25,74 | € 8,63 | 2,19 |
| 2 verschillende kleine | € 17,16 | € 8,58 | 1,59 |
| 3 verschillende kleine | € 25,74 | € 13,81 | 2,84 |
| 5 verschillende kleine | € 42,90 | € 13,81 | 3,557 |
| 1 meubel (het lichtste) | € 8,58 | € 8,58 | 0,2 |
| 1 meubel + 1 klein | € 17,16 | € 8,58 | 0,93 |

- **Eén pakket per bestelling, geprijsd op gewicht** — niet de som per
  artikel. Gemeten treden: tot ongeveer 2 kg € 8,58, rond 2,2 kg € 8,63,
  2,8–3,6 kg € 13,81. Steeds SEUR.
- Het antwoord geeft het **gewicht** van de mand, terwijl de productgegevens
  plaatshouders hebben (§ 10): BigBuy kent het echte gewicht dus wel.
- Niet gemeten: een zwaar meubel in een mand (het gekozen meubel was het
  lichtste), en waar de treden boven 3,6 kg liggen.

GEDOCUMENTEERD (BigBuy API, OpenAPI 3.0.0 `doc.json`, geraadpleegd 2026-10-04):
- `POST /rest/order/check` simuleert een bestelling en geeft de totalen terug;
  `POST /rest/order/create` plaatst hem echt (antwoord 201, order-id in de
  `Location`-header). Beide 1 per seconde.
- **Eigen referentie:** `internalReference` in de bestelling, terug te
  zoeken met `GET /rest/order/reference/{reference}`. Dat is het mechanisme
  om na een timeout vast te stellen of een bestelling aankwam
  (`docs/IDEMPOTENCY.md`). Of BigBuy een dubbele referentie weigert (409
  "constrain conflicts"?) staat er niet: meten in de sandbox.
- Betalen aan BigBuy: `paypal`, `moneybox` (tegoed, `GET /rest/user/purse`) of
  `bankwire`.
- Het afleveradres vraagt verplicht **e-mail en telefoon** van de klant
  (`docs/PRIVACY.md`).
- Meerdere verzendadressen: `/order/create/multishipping`. Vervoerder kiezen
  per bestelling (`carriers`).
- Tracking via polling (`/rest/tracking/order/{id}`, `/rest/tracking/orders`);
  **webhooks komen in de documentatie niet voor**.

---

## 11. Foutgedrag

- [ ] Komen fouten als HTTP-status terug, of als foutcode in een 200-antwoord?
- [ ] Welke endpoints falen structureel? (Noteer ze — een kapot onderdeel van
      de leverancier mag geen foutpagina in jouw winkel opleveren.)
- [ ] Wat zegt de API als je over de rate limit gaat? Stuurt hij
      `Retry-After`?
- [ ] Typische en trage latentie (p50/p95) per soort call — de basis voor de
      timeouts in `docs/SUPPLIER_RESILIENCE.md`.

GEMETEN 2026-10-05 — Omgeving: sandbox (`api.sandbox.bigbuy.eu`), sandbox-sleutel van de eigenaar, `scripts/measure-supplier.mjs`.
Waarneming:
- Fouten komen als HTTP-status met body `{"code","message"}` (400, 500); de
  401 bij een ongeldig token heeft alleen `message`.
- **Rate-limit-headers bestaan, meer dan gedocumenteerd**:
  `X-RateLimit-Limit`, `X-RateLimit-Remaining` en `X-RateLimit-Reset` (Unix-
  tijd). De limieten kloppen met de documentatie: 10 voor productlijsten en
  talen, 24 voor taxonomieën en productinformatie, 1 voor user/shipping. Het
  venster loopt **een uur vanaf de eerste call** (reset 08:52:08 UTC na een
  eerste call om 07:52 UTC).
- `X-RateLimit-Remaining` bleef 9 na drie afgewezen (HTTP 400) calls op
  `products`: een afgewezen call telt waarschijnlijk niet mee (`AANNAME`,
  één waarneming).
- Latentie: catalogus 47–76 ms; `auth/status`, `purse` en `order/reference`
  1,6–1,8 s. Te weinig calls voor p50/p95.
- `Retry-After` kwam niet voor.

GEMETEN 2026-10-05 — Omgeving: productie (`api.bigbuy.eu`), productiesleutel van de eigenaar, alleen lezen (`scripts/measure-supplier.mjs --production`, 08:34 UTC).
Waarneming: 18 × HTTP 200 en 1 × 404 (bedoeld); geen fouten. Latentie
productie: catalogus 77–843 ms, `pageSize=1000` 2,2 s, `auth/status` 203 ms —
sneller dan de sandbox voor `auth/status`, `purse` en `order/reference`.

GEMETEN <<DATUM>>: <<ANTWOORD>>

GEDOCUMENTEERD (BigBuy API, OpenAPI 3.0.0 `doc.json`, geraadpleegd 2026-10-04): fouten komen als HTTP-status
(400, 404, 409, 415, 429) met body `{"code", "message"}`. De header
`X-RateLimit-Limit` bestaat (voorbeeld: 1200 — dat rijmt niet met "10 per uur"
per endpoint: meten). `Retry-After` wordt niet genoemd. Gedrag bij 5xx:
niet gedocumenteerd.

GEMETEN 2026-10-05 — sandbox (`api.sandbox.bigbuy.eu`), met een ongeldige
token: `GET /rest/user/auth/status.json` gaf HTTP 401 met body
`{"message":"Invalid Token"}` — zonder het `code`-veld uit de documentatie —
in 162 ms, zonder rate-limit-headers.

---

## Rate limits

GEDOCUMENTEERD (doc.json, geraadpleegd 2026-10-04), per endpoint:

| Endpoint | Limiet |
|---|---|
| `products`, `productprices`, `productsstockbyhandlingdays`, `productsimages`, `productsvariations`, `productvariationprices`, `variations`, `languages` | 10 per uur |
| `productsinformation`, `taxonomies`, `attributes`, `tags`, `productstags` | 24 per uur |
| `manufacturers`, `productstaxonomies` | 5 per uur |
| `new-products` (wordt één keer per dag bijgewerkt) | 2 per uur |
| één artikel (`product/{id}`, `productinformation/{id}`, `productstockbyhandlingdays/{id}`, …) | 1 per 5 s |
| `order/*`, `shipping/*`, `tracking/*`, `user/*` | 1 per s |
| `shipping/lowest-shipping-costs-by-country/{land}` | 36 per 6 uur |

**Wat dit betekent:** de catalogus is niet per paginaweergave op te vragen —
één artikel per vijf seconden voor de hele winkel. Weergave, zoeken en
filteren draaien op een eigen, periodiek gesynchroniseerde kopie. Dit raakt
`.claude/rules/catalogus.md` § Caching en `docs/SUPPLIER_RESILIENCE.md`; de
keuze staat open (zie het rapport van 2026-10-04 en D-01).

## Mapping naar ons datacontract

Vul dit in zodra `src/lib/catalog/types.ts` staat. Dit is de tabel waar iemand
over een jaar naar kijkt als een veld leeg blijkt.

| Ons veld | Bron bij de leverancier | Opmerking |
|---|---|---|
| `id` | | |
| `name` | | |
| `price` | | `Money`, exacte conversie naar centen |
| `supplierCost` | | server-only; incl. of excl. btw (§6) |
| `offerId` | | de gekozen aanbieding |
| `availability` | | van de gekozen aanbieding |
| `stock` | | van diezelfde aanbieding |
| `imageUrl` | | |

## Kosten per paginaweergave

Zet het loggen van uitgaande verzoeken aan en tel ze, één keer, per soort
pagina. Dit is de goedkoopste meting die er is en hij vindt altijd iets:
eerder bleek de navigatie dezelfde lijst drie keer op te halen, en het
filterblok van een categoriepagina duurder dan de artikelen zelf.

GEMETEN <<DATUM>>: <<ANTWOORD>>
