# Vragen aan BigBuy

Wat je niet kunt meten moet je vragen. Hou hier bij wat er uitstaat en wat er
geantwoord is — anders vraagt de volgende persoon het opnieuw, of erger: hij
gokt het antwoord.

**Vraag in één bericht, niet in zeven.** Support bij een groothandel antwoordt
traag en vaak maar op de eerste vraag; nummer ze dus en zet er bij elke vraag
bij waarom je het wilt weten.

**Stand:** mail met vraag 1–21 opgesteld op 2026-10-06 (hieronder) en
verstuurd door de eigenaar (gemeld op 2026-10-10; datum van versturen niet
opgegeven), daarna de vervolgmail met 22–25. **Antwoord van BigBuy ontvangen
2026-10-22** (twee mails, door de eigenaar gedeeld): beantwoord zijn 4, 5
(deels), 8, 10 (algemeen), 13 en 16. Voor 1, 2, 3 en 6 vraagt BigBuy een eigen
ticket; de rest bleef onbeantwoord. **Ticket A, B en C en de herhaling
hieronder ingediend op 2026-10-31** (opgave eigenaar: "allemaal ingediend"),
via de Contact area in het BigBuy-account, onderwerp "API Customers";
ticketnummers nog niet opgegeven. **Antwoord op ticket A en C ontvangen 2026-11-02** (hieronder). Zet per nummer het antwoord erbij en wat je
ermee deed.

| # | Onderwerp | Waarom | Raakt | Antwoord |
|---|---|---|---|---|
| 1 | Adviesprijs (`retailPrice`) incl. of excl. btw | Inkoop is excl. btw (schermafdruk V0710266); bij excl. staan de prijzen 21 % te laag | D-03 | 2026-10-22: **niet beantwoord**: schermafdrukken gevraagd, in een eigen ticket (ticket A hieronder). 2026-11-02 (ticket A): **`wholesalePrice` én `retailPrice` zijn exclusief btw** (bevestigd) |
| 2 | Verzendkosten (`lowest-shipping-costs`, `shipping/orders`) incl. of excl. btw | Grote artikelen rekenen dat bedrag door | D-13 | 2026-10-22: **niet beantwoord**: eigen ticket gevraagd (ticket B) |
| 3 | Wat `inShopsPrice` is | Onduidelijk (74,38 bij V0710266) | D-03 | 2026-10-22: **niet beantwoord**: eigen ticket gevraagd (in ticket A). 2026-11-02: in het antwoord op ticket A **niet beantwoord** |
| 4 | Eén pakket per bestelling op gewicht; gewichtstreden naar NL | Gemeten: 5 kleine artikelen € 13,81 | D-13 | 2026-10-22: gefactureerd **per bestelling**; afhankelijk van de artikelen in één of meer pakketten. Gewichtstreden niet gegeven: "verzendsimulatie via de winkelwagen" in het paneel |
| 5 | Neutrale verpakking; wie is producent van de verpakking | Verpact, PPWR | D-36 | 2026-10-22: **neutrale verpakking**, geen BigBuy-logo meer. Eigen winkelnaam op het pakket en wie producent is: niet beantwoord (adviseur) |
| 6 | ~1 % op voorraad; filter op leverbaar | Omvang van de winkel | D-02, D-31 | 2026-10-22: voorraad "realtime" bijgewerkt; filter via de API: eigen ticket gevraagd (ticket C). 2026-11-02: **geen filter genoemd**: verwijzing naar de documentatie en de gebruikershandleiding; daarin staat er ook geen. Het verversen blijft zoals gebouwd (D-31) |
| 7 | Zijn categorie-id's stabiel | Wij zoeken nu op naam | D-02 | |
| 8 | Bericht bij vervallen artikel of nieuw nummer | Kopie actueel houden | D-31 | 2026-10-22: geen bericht: de catalogus is "realtime" bijgewerkt. Dus zelf blijven verversen, zoals gebouwd (D-31) |
| 9 | Foto's cachen en via eigen domein tonen | Zo gebouwd (D-31) | D-31 | |
| 10 | `productcompliance` 404; waarschuwingen in het Nederlands | GPSR verplicht (D-34) | D-02, D-34 | 2026-10-22: algemene GPSR-uitleg: **BigBuy kan niet de EU-verantwoordelijke zijn**, dat is de fabrikant of de importeur; de winkel moet de gegevens en waarschuwingen in de taal van het land tonen. Hulp: een gids en een fabrikantendatabase (paneel > Downloads). Wat 404 betekent en of er Nederlandse waarschuwingen zijn: niet beantwoord |
| 11 | 404 op onbekende eigen referentie betrouwbaar; dubbele referentie geweigerd | Na een timeout weten of een bestelling aankwam (in productie 404, in de sandbox 500) | D-04 | |
| 12 | Voorraad net op bij het bestellen | Wat zeggen we de klant | D-04, D-22 | 2026-11-02, uit de gebruikershandleiding (`GEDOCUMENTEERD`, niet in een antwoord): `create` weigert met **409, code `ER003`** ("Products have no stock"), soms met een alternatief artikel met dezelfde EAN. Geen deellevering bij één magazijn. Wat de klant hoort: blijft open |
| 13 | Bestelling annuleren na plaatsen | Er is geen annuleer-endpoint | D-04 | 2026-10-22: **bevestigd**: geen annuleer-endpoint; annuleren via een ticket zolang de bestelling niet in voorbereiding is. Nieuw: **"Schedule your orders"**, bestellingen inplannen en zelf annuleren vóór verwerking (Academy). Of dat via de API werkt: niet gezegd |
| 14 | Moneybox en PayPal volledig automatisch | Automatisch inkopen (D-04) | D-04 | |
| 15 | Bestellen testen zonder echte bestelling | Sandbox zonder catalogus en vervoerders | D-04, D-17 | |
| 16 | Retouren: werkwijze, adres, termijn, kosten | 14 dagen bedenktijd | D-09 | 2026-10-22: verzendkosten heen én terug worden **niet** terugbetaald; zijn ze hoger dan de waarde van het artikel, dan geen terugbetaling. Geweigerd pakket: terugbetaling na ontvangst en verwerking, met aftrek per geval (verzending, retourafhandeling). Defect: via Returns, terugbetaald op het tegoed (bevestigd) |
| 17 | Documenten: voedselcontact/BPA, EUDR-referenties, REACH art. 33 | Plichten van de winkel (ONDERZOEK § 7) | D-36 | |
| 18 | UPV Textiel geregistreerd? | Woningtextiel later | D-36 | |
| 19 | Rate limit per sleutel of per account; gevolg van overschrijden | Verversen binnen de limieten | D-31 | |
| 20 | Statuspagina of storingsmelding | Storing bij hen onderscheiden van een fout bij ons | SUPPLIER_RESILIENCE | |
| 21 | Moet API-toegang in productie geactiveerd worden | Zekerheid voor livegang | D-01 | |
| 22 | Adres InnovaGoods voor GPSR (BigBuy geeft een onvolledig, ander adres dan hun aviso legal) | Wettelijke fabrikantgegevens bij het grootste merk | D-31, D-34 | |
| 23 | Mutaties van het tegoed (moneybox) inzien | Terugbetalingen van retouren en weigeringen controleren | D-04, D-09 | 2026-10-22: niet beantwoord. Wel: nieuwe manieren om op te waarderen ("Other payment methods"); opnemen boven € 50 via het paneel |

## De mail (Engels)

Vul vóór het versturen je naam en je BigBuy-klantnummer in.

```text
Subject: API questions before going live – WonZo (the Netherlands) – customer no. [YOUR CUSTOMER NUMBER]

Hello BigBuy team,

We are building WonZo (wonzo.nl), a webshop for consumers in the Netherlands,
run by R.M.A. Marketing (Dutch Chamber of Commerce no. 42126738). We use the
BigBuy API for the catalogue, stock and dropshipping orders, and we place
orders automatically once a customer has paid.

Before we go live we need answers to the questions below. They are numbered;
a short answer per number is perfect, and an example where the answer is
"it depends".

A. Prices and VAT
1. For V0710266 our account shows "DP 18,22 €" and "AVP 55,79 €" with the
   note "Exclusief belastingen"; the API gives wholesalePrice 18.22 and
   retailPrice 55.79. Is retailPrice (AVP) also excluding VAT? We must show
   consumer prices including 21% Dutch VAT, so this decides our prices.
2. Are the amounts from /rest/shipping/lowest-shipping-costs-by-country/nl and
   /rest/shipping/orders including or excluding VAT?
3. What is inShopsPrice (74.38 for V0710266)?

B. Shipping and packaging
4. /rest/shipping/orders gave one cost for several products together, based
   on the total weight (for example five small products: 13.81). Is that how
   you invoice us: one parcel per order, priced by weight? Where can we find
   the weight bands for the Netherlands?
5. Do you ship in neutral packaging, and can our shop name appear on the
   parcel? This decides who counts as the producer of the packaging under
   Dutch and EU packaging rules (Verpact, PPWR).

C. Catalogue and stock
6. About 1% of the products in the API have stock. Is that normal, and is
   there a way to request only products that are in stock (an endpoint or a
   filter)?
7. Are taxonomy (category) IDs stable over time, or can they change or be
   reused?
8. How do we find out that a product is discontinued or gets a new SKU?
9. May we cache your product photos and show them from our own domain,
   resized, and for how long?
10. For some products /rest/catalog/productcompliance/{id} returns 404. Does
    that mean there is no GPSR data for that product? Are the safety warnings
    available in Dutch (isoCode=nl)?

D. Orders
11. In production, /rest/order/reference/{reference} returns 404 for an
    unknown reference (the sandbox returned 500). After a timeout, can we rely
    on 404 meaning "this order was not created"? Is a duplicate
    internalReference rejected?
12. What happens to an order when the stock runs out between our check and
    /rest/order/create: is it rejected, partly delivered or back-ordered?
13. Can an order be cancelled after it was created (through the API or
    otherwise), and until when?
14. When we pay with the moneybox, is the order charged and processed fully
    automatically, without a manual step? And with PayPal?
15. How can we test ordering end to end without creating a real order and
    invoice? The sandbox has no catalogue (product lists return HTTP 400) and
    no carriers.
16. How are returns handled (consumers in the EU have 14 days to withdraw):
    procedure, return address, time limits, and who pays the return shipping?

E. Compliance documents
17. Can you provide per product: declarations of conformity for food-contact
    materials (including BPA-free), EUDR due diligence statement references
    for wood, paper and charcoal products, and REACH Article 33 information
    (substances of very high concern)?
18. Are you registered for extended producer responsibility for textiles in
    the Netherlands (UPV Textiel), or must the shop register itself?

F. API
19. Are the rate limits per API key or per account, and what happens when we
    exceed one (how long does a 429 last)?
20. Is there a status page or a notification for API outages?
21. Does using the production API for the catalogue and for orders need any
    activation or subscription in our account?

Thank you very much. We are happy to give more details where needed.

Kind regards,

[YOUR NAME]
WonZo – R.M.A. Marketing
Thaliastraat 267, 6846 XX Arnhem, the Netherlands
info@wonzo.nl
```

## Vervolgmail (Engels, nog niet verstuurd)

Als antwoord in dezelfde ticket of mail, zodat de nummers blijven kloppen.

```text
Subject: Re: API questions before going live – WonZo (the Netherlands) – customer no. [YOUR CUSTOMER NUMBER]

Hello BigBuy team,

Two additions to our earlier questions, and four new ones.

13 (addition). The API has no endpoint to cancel an order. Is cancelling only
    possible through a ticket in the Contact area while the order is not yet
    in preparation? Can we delay the validation of orders placed through the
    API, and does that also apply to Standard Shipment?
16 (addition). Your guarantee page says you do not take back products in
    perfect condition, and that defective products are collected from us
    through the RETURNS tab (free every two months from 90 EUR) and refunded
    to the wallet. Is that still current? When a consumer refuses a parcel,
    what exactly is deducted from the refund?
22. For InnovaGoods (Nine New Investments S.L.) productcompliance gives the
    address "Av. Paret del patriarca, 15" without postal code, city or
    country, while their own legal notice gives "C/ Enguera 7, 46018
    Valencia". Which address is correct for GPSR, and can the record be
    completed?
23. /rest/user/purse gives the wallet balance. Is there a way (API or an
    export in the panel) to see the wallet movements, so we can match
    refunds of returns and refused parcels?
24. We want every parcel to contain a prepaid return label to our own
    return address in the Netherlands (Thaliastraat 267, 6846 XX Arnhem).
    Can you put a label we supply (PDF per order, or one fixed label) in
    the parcel, and how do we pass it with an order placed through the API?
25. /rest/tracking/orders returns trackings with a "statusDescription"
    (the documentation shows "delivered"). Which values can it have, in
    which language (we send isoCode=en), and does an order with more than
    one parcel get one tracking per parcel?

Thank you.

Kind regards,

[YOUR NAME]
WonZo – R.M.A. Marketing
```

## Antwoorden die het ontwerp raken

Zet hier het antwoord én wat je ermee gedaan hebt. Een antwoord zonder gevolg
is informatie; een antwoord mét gevolg is een beslissing en hoort ook in
`docs/DECISIONS.md`.

**2026-10-22, eerste antwoorden** (zie de tabel). Wat ermee gedaan is:

- **1–3 (btw, D-03):** niets beantwoord: de prijsregel blijft geblokkeerd. Ticket A met schermafdrukken.
- **4 (verzending, D-13):** gefactureerd per bestelling, soms in meer pakketten. Onze regel (één bedrag per
  bestelling uit `shipping/orders`, grote artikelen per stuk) blijft; de gewichtstreden staan niet in het antwoord.
- **5 (verpakking, D-36):** neutraal, zonder logo. Wie de producent van de verpakking is voor Verpact: voor de adviseur.
- **10 (GPSR, D-34):** BigBuy neemt de rol van EU-verantwoordelijke niet. De selectieregel eist al fabrikantgegevens
  met adres (D-02, regel 6); voor de adviseur: is WonZo bij levering vanuit Spanje "importeur" in de zin van de GPSR
  (de fabrikant kan buiten de EU zitten)? Hun fabrikantendatabase kan het adres van InnovaGoods (vraag 22) aanvullen.
- **13 (annuleren, D-04):** bevestigd. "Schedule your orders" is een optie naast ons eigen venster van 30 minuten;
  een keuze voor de eigenaar, en eerst uitzoeken of het via de API werkt (in de herhaling).
- **16 (retouren, D-09, D-16):** verzendkosten heen en terug komen nooit terug, ook niet bij een defect; bij een
  geweigerd pakket volgt een aftrek per geval. Dat hoort in de kostprijs (retourrisico, D-16).

**2026-11-02, antwoord op ticket A** (door de eigenaar gedeeld): "both wholesalePrice and retailPrice (AVP) are
provided excluding VAT". Vraag 1 is beantwoord, vraag 3 (`inShopsPrice`) niet. Gevolg: de lokale winkel met de
echte catalogus toont de adviesprijs nu als prijs incl. btw (`sellingPrice` in `src/lib/pricing/index.ts`), dus
21 % te laag. Live staat de catalogus op mock (D-03), dus daar niet. Wat de prijs wordt, beslist D-03.

**2026-11-02, antwoord op ticket C** (door de eigenaar gedeeld): geen inhoudelijk
antwoord. BigBuy verwijst naar het paneel (My Account > Synchronise with BigBuy > API KEY), de technische
documentatie (`https://api.bigbuy.eu/rest/doc`) en de gebruikershandleiding
(`https://www.bigbuy.eu/public/doc/Guia_API_BigBuy_EN.pdf`, door de eigenaar gedeeld als Markdown). Wat de
handleiding zegt en wat het voor ons betekent (`GEDOCUMENTEERD`):

- **Geen filter op voorraad en geen "gewijzigd sinds"** in de handleiding. Vraag 6 is daarmee beantwoord als
  "niet mogelijk"; ons verversen per hoofdgroep blijft (D-31).
- **Aanbevolen ritme:** catalogus één keer per dag of elke 8 uur (wij: elke nacht); voorraad elke 10–15 minuten.
  Dat laatste past niet binnen hun eigen limiet van 10 lijstaanroepen per uur (`GEDOCUMENTEERD`) bij 11 pagina's voorraad per
  ronde (D-31: elke 2 uur). Niet als vraag teruggestuurd; wel een argument bij vraag 19 (limieten).
- **Voorraad net op bij `create`:** 409 met `ER003`, soms met een alternatief artikel (vraag 12). Onze inkoop
  leest een 409 bij `create` als "geen uitsluitsel" (`src/lib/catalog/bigbuy/ordering.ts`), zoekt dan op de
  eigen referentie, krijgt een 404, zet de inkooporder op `REJECTED` en probeert opnieuw; de nieuwe controle
  weigert dan, en de eigenaar krijgt de melding (D-04). Dat klopt, met een omweg van een paar minuten.
  Aanpassen kan later, zodra gemeten is hoe een 409 voor een dubbele referentie eruitziet (vraag 11).
- **Meerdere magazijnen:** alleen bij `/order/create/multishipping` kan een bestelling half worden aangemaakt.
  Wij gebruiken `/order/check` en `/order/create` (één verzendadres): niet van toepassing, tenzij BigBuy bij
  artikelen uit twee magazijnen ook daar splitst (niet gemeten; nu alleen magazijn 1 gezien).
- **Varianten:** voorraad per variant via `productsvariationsstockbyhandlingdays` (al bekend als nog te meten,
  `docs/api/LEVERANCIER.md`).
- **`taxRate` en `taxId`** staan in de productlijst (voorbeeld: `taxRate` 10). Dat zegt welk btw-tarief BigBuy
  rekent, niet of `retailPrice` incl. btw is: geen antwoord op vraag 1 (ticket A loopt nog).

## Ticket A (Engels): adviesprijs en `inShopsPrice`, met schermafdrukken

Voeg twee schermafdrukken toe: de productpagina van V0710266 in je BigBuy-account (met "DP" en "AVP" en de tekst
"Exclusief belastingen"), en het API-antwoord voor V0710266 (de velden `wholesalePrice`, `retailPrice` en
`inShopsPrice`).

```text
Subject: Price fields in the API for V0710266 – VAT – customer no. [YOUR CUSTOMER NUMBER]

Hello,

As asked, a dedicated ticket with screenshots (attached).

For product V0710266 our Control Panel shows "DP 18,22 €" and "AVP 55,79 €"
with the note "Exclusief belastingen" (excluding taxes). The API
(/rest/catalog/products) returns wholesalePrice 18.22, retailPrice 55.79 and
inShopsPrice 74.38.

1. Is retailPrice (AVP) excluding VAT, like wholesalePrice?
2. What is inShopsPrice, and is it including VAT?

We sell to consumers in the Netherlands and must show prices including 21%
VAT, so this decides our selling prices. We do not use the MIP; we only use
the API.

Thank you.
```

## Ticket B (Engels): btw op verzendkosten

```text
Subject: VAT on shipping costs in the API – customer no. [YOUR CUSTOMER NUMBER]

Hello,

As asked, a dedicated ticket. Are the shipping amounts returned by
/rest/shipping/lowest-shipping-costs-by-country/nl and by /rest/shipping/orders
including or excluding VAT? For example, five small products together gave
13.81 for the Netherlands. We pass this amount on to our customers for large
items, so we need to know whether VAT is included.

Thank you.
```

## Ticket C (Engels): alleen artikelen op voorraad opvragen

```text
Subject: Requesting only products in stock through the API – customer no. [YOUR CUSTOMER NUMBER]

Hello,

As asked, a dedicated ticket. About 1% of the products in the catalogue have
stock. We now download all product, stock and information lists per category
(/rest/catalog/products, /rest/catalog/productsstockbyhandlingdays,
/rest/catalog/productsinformation) within the hourly limits, which takes
hours. Is there a filter or an endpoint that returns only products with stock,
or only products changed since a given date?

Thank you.
```

## Herhaling (Engels): de vragen zonder antwoord

```text
Subject: Re: API questions before going live – WonZo (the Netherlands) – customer no. [YOUR CUSTOMER NUMBER]

Hello,

Thank you for your answers. Some questions were not answered yet; we repeat
them with their original numbers. Questions 1, 2, 3 and 6 are in separate
tickets, as you asked.

7. Are taxonomy (category) IDs stable over time, or can they change or be reused?
9. May we cache your product photos and show them from our own domain, resized?
10. When /rest/catalog/productcompliance/{id} returns 404, does that mean there
    is no GPSR data for that product? Are the safety warnings available in
    Dutch (isoCode=nl)?
11. In production, /rest/order/reference/{reference} returns 404 for an unknown
    reference. After a timeout, can we rely on 404 meaning "this order was not
    created"? Is a duplicate internalReference rejected?
12. What happens when the stock runs out between our check and
    /rest/order/create: rejected, partly delivered or back-ordered?
13 (addition). Can "Schedule your orders" be used for orders created through
    the API (/rest/order/create), and can a scheduled order be cancelled
    through the API?
14. With the wallet (moneybox), is an API order charged and processed fully
    automatically, without a manual step?
15. How can we test ordering end to end without creating a real order? The
    sandbox has no catalogue and no carriers.
17. Can you provide per product: declarations of conformity for food-contact
    materials (BPA-free), EUDR due diligence statement references, and REACH
    Article 33 information?
18. Are you registered for UPV Textiel in the Netherlands?
19. Are the rate limits per API key or per account, and how long does a 429 last?
20. Is there a status page or a notification for API outages?
21. Does the production API for orders need any activation in our account?
22. For InnovaGoods, productcompliance gives "Av. Paret del patriarca, 15"
    without postal code, city or country. Which address is correct for GPSR,
    and can the record be completed?
23. Is there a way (API or export) to see the wallet movements?
24. Can you put a return label we supply (prepaid, to our address in the
    Netherlands) in each parcel, and how do we pass it with an API order?
25. Which values can statusDescription in /rest/tracking/orders have, in which
    language, and is there one tracking per parcel?

Thank you.
```
