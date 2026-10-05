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

GEMETEN <<DATUM>>: <<ANTWOORD>>

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

GEMETEN <<DATUM>>: <<ANTWOORD>>

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

GEMETEN <<DATUM>>: <<ANTWOORD>>

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

GEMETEN <<DATUM>>: <<ANTWOORD>>

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

GEMETEN <<DATUM>>: <<ANTWOORD>>

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
