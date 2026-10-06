# Vragen aan BigBuy

Wat je niet kunt meten moet je vragen. Hou hier bij wat er uitstaat en wat er
geantwoord is — anders vraagt de volgende persoon het opnieuw, of erger: hij
gokt het antwoord.

**Vraag in één bericht, niet in zeven.** Support bij een groothandel antwoordt
traag en vaak maar op de eerste vraag; nummer ze dus en zet er bij elke vraag
bij waarom je het wilt weten.

**Stand:** mail opgesteld op 2026-10-06 (hieronder), nog niet verstuurd. Zet de
datum van versturen erbij, en per nummer het antwoord en wat je ermee deed.

| # | Onderwerp | Waarom | Raakt | Antwoord |
|---|---|---|---|---|
| 1 | Adviesprijs (`retailPrice`) incl. of excl. btw | Inkoop is excl. btw (schermafdruk V0710266); bij excl. staan de prijzen 21 % te laag | D-03 | |
| 2 | Verzendkosten (`lowest-shipping-costs`, `shipping/orders`) incl. of excl. btw | Grote artikelen rekenen dat bedrag door | D-13 | |
| 3 | Wat `inShopsPrice` is | Onduidelijk (74,38 bij V0710266) | D-03 | |
| 4 | Eén pakket per bestelling op gewicht; gewichtstreden naar NL | Gemeten: 5 kleine artikelen € 13,81 | D-13 | |
| 5 | Neutrale verpakking; wie is producent van de verpakking | Verpact, PPWR | D-36 | |
| 6 | ~1 % op voorraad; filter op leverbaar | Omvang van de winkel | D-02, D-31 | |
| 7 | Zijn categorie-id's stabiel | Wij zoeken nu op naam | D-02 | |
| 8 | Bericht bij vervallen artikel of nieuw nummer | Kopie actueel houden | D-31 | |
| 9 | Foto's cachen en via eigen domein tonen | Zo gebouwd (D-31) | D-31 | |
| 10 | `productcompliance` 404; waarschuwingen in het Nederlands | GPSR verplicht (D-34) | D-02, D-34 | |
| 11 | 404 op onbekende eigen referentie betrouwbaar; dubbele referentie geweigerd | Na een timeout weten of een bestelling aankwam (in productie 404, in de sandbox 500) | D-04 | |
| 12 | Voorraad net op bij het bestellen | Wat zeggen we de klant | D-04, D-22 | |
| 13 | Bestelling annuleren na plaatsen | Er is geen annuleer-endpoint | D-04 | |
| 14 | Moneybox en PayPal volledig automatisch | Automatisch inkopen (D-04) | D-04 | |
| 15 | Bestellen testen zonder echte bestelling | Sandbox zonder catalogus en vervoerders | D-04, D-17 | |
| 16 | Retouren: werkwijze, adres, termijn, kosten | 14 dagen bedenktijd | D-09 | |
| 17 | Documenten: voedselcontact/BPA, EUDR-referenties, REACH art. 33 | Plichten van de winkel (ONDERZOEK § 7) | D-36 | |
| 18 | UPV Textiel geregistreerd? | Woningtextiel later | D-36 | |
| 19 | Rate limit per sleutel of per account; gevolg van overschrijden | Verversen binnen de limieten | D-31 | |
| 20 | Statuspagina of storingsmelding | Storing bij hen onderscheiden van een fout bij ons | SUPPLIER_RESILIENCE | |
| 21 | Moet API-toegang in productie geactiveerd worden | Zekerheid voor livegang | D-01 | |

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

## Antwoorden die het ontwerp raken

Zet hier het antwoord én wat je ermee gedaan hebt. Een antwoord zonder gevolg
is informatie; een antwoord mét gevolg is een beslissing en hoort ook in
`docs/DECISIONS.md`.
