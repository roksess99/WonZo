# Onderzoek — wat WonZo moet hebben

Onderzoek op verzoek van de eigenaar (2026-10-05), vóór het bouwen: wat zijn
de belangrijkste features voor een webshop als WonZo, wat doen vergelijkbare
winkels, en hoe wordt de winkel rustig, overzichtelijk en bruikbaar voor alle
leeftijden.

**Status:** referentie. Conclusies zijn voorstellen; wat de eigenaar
overneemt, gaat naar `docs/DECISIONS.md` of `docs/SCHERMEN.md`. Alle feiten
hieronder zijn `GEDOCUMENTEERD` (bron en datum onderaan, geraadpleegd
2026-10-05) of `WETTELIJK` (te bevestigen door een adviseur). Niets hiervan is
in dit project gemeten.

**Wat niet lukte:** Coolblue blokkeert automatisch ophalen (HTTP 403); hun
aanpak komt uit artikelen over Coolblue, niet uit eigen waarneming. Van
Blokker kwam alleen een deel van de pagina mee. Baymard en Nielsen Norman
Group zijn de belangrijkste bronnen; hun volledige rapporten zijn betaald, de
gebruikte cijfers komen uit hun openbare samenvattingen.

---

## 1. Vijf conclusies die het ontwerp sturen

### 1.1 Levertijd is de zwakke plek van WonZo — eerlijk zijn is verplicht

- Nederlanders verwachten een standaardlevering in gemiddeld **twee dagen**
  (Sendcloud).
- **20 %** van de afhakers in de checkout noemt "levering te traag" (Baymard).
- BigBuy levert vanuit een magazijn met een verwerkingstijd per magazijn
  (`docs/api/LEVERANCIER.md` § 7); twee dagen is daarmee niet te halen.
- De ACM eist van winkels die vanuit het buitenland leveren: een **duidelijke
  en juiste levertijd**, het **land van verzending**, een retouradres en wie
  de retourkosten betaalt (`WETTELIJK`, ACM 22-02-2024). De Consumentenbond
  vond in 2024 dat dropshippers dit massaal fout doen: levertijd niet tijdens
  het bestellen, retourkosten niet vermeld (82 van de 100).

**Gevolg:** de levertijd staat op de productkaart, de productpagina, in de
winkelwagen, bij het afrekenen en in de bevestiging — als bereik ("3–6
werkdagen"), uit de gegevens van BigBuy, met het land van verzending. Dat is
de wet, en het past bij het brandbook ("eerlijk over levertijd"). Een winkel
die eerlijk is over vijf dagen verliest minder dan een die twee belooft en
vijf levert.

### 1.2 Alle kosten vooraf zichtbaar

- **40 %** van de afhakers noemt te hoge extra kosten; **12 %** kon het totaal
  niet vooraf zien (Baymard, 2025).
- **59,4 %** van de Nederlanders annuleert een bestelling bij hoge
  verzendkosten; **70,1 %** voegt iets toe om gratis verzending te halen
  (Sendcloud).
- De gemiddelde drempel voor gratis verzending in Nederland ligt rond
  **€ 25** (Sendcloud, 2025); vidaXL hanteert **€ 70**.

**Gevolg:** verzendkosten op de productpagina vóór de knop; in de
winkelwagen "nog € X tot gratis verzending". De drempel zelf is D-13.

### 1.3 Vertrouwen moet je verdienen — vooral bij een onbekende winkel

- Ruim **40 %** van de online kopende ouderen vindt het moeilijk te zien of een
  webshop veilig is; ze letten op een bekende naam (65 %), het slotje (57 %),
  een keurmerk (46 %) en de betaalmethode (39 %) (SeniorWeb, via Emerce).
- **96 %** van de consumenten herkent het Thuiswinkel Waarborg-logo; **72 %**
  zegt eerder te kopen bij een winkel met dat keurmerk (Consumentenbond 2022,
  via Shopify). Kanttekening: veel consumenten vinden keurmerken ook
  marketing.
- **iDEAL** is in Nederland dominant: 58 % van de online betalingen in Q1 2026
  (Betaalvereniging). Het bekende logo is zelf een vertrouwenssignaal.
- KvK- en btw-nummer zichtbaar is wettelijk (ACM) en het eerste waar een
  twijfelaar naar zoekt (`docs/SCHERMEN.md`).

### 1.4 Eenvoud wint

- **18 %** haakt af omdat een account verplicht is; **17 %** vindt de checkout
  te lang of ingewikkeld (Baymard). Een goede checkout heeft **7–8
  invoervelden**; het gemiddelde is twee keer zoveel.
- Ouderen haken af bij te veel persoonsgegevens en een verplicht account
  (SeniorWeb).
- Coolblue wordt vooral geroemd om **heldere productinformatie** en
  **duidelijkheid over verzendkosten en levertijd**, en om een selectie met
  duidelijke verschillen waardoor kiezen makkelijk is (MT/Sprout, Emerce).

### 1.5 Bruikbaar voor alle leeftijden

Uit het onderzoek van Nielsen Norman Group met 65-plussers (123 deelnemers,
2001–2019): ouderen slagen minder vaak in een taak (55 % tegen 75 % bij
jongeren), en de oorzaken zijn steeds dezelfde:

- **te kleine en te lichte tekst**;
- **te kleine raakvlakken** ("fat-fingered") — uitklapmenu's en kleine links;
- **foutmeldingen** die onduidelijk zijn of niet opvallen;
- **onbuigzame formulieren** die maar één invoervorm accepteren.

Wat ouderen helpt, helpt iedereen: een drukke ouder met één hand vrij, iemand
met een kapotte bril, iemand op een trage verbinding. Dit sluit aan op WCAG
2.2 AA (D-28).

---

## 2. Wettelijke punten voor elektronica en huishouden

Deze staan nog nergens in de set. Allemaal `WETTELIJK`, **te bevestigen door
een adviseur** voordat er op gebouwd wordt.

| Onderwerp | Wat het vraagt | Wat BigBuy levert | Bron |
|---|---|---|---|
| **Energielabel** | Bij producten met een energielabel (o.a. koelkasten, wasmachines, tv's, verlichting): het label en de productinformatiekaart bij de prijs; de klasse ook in lijsten en zoekresultaten | Een vlag `energyEfficiency` bij afbeeldingen (`docs/api/LEVERANCIER.md` § 8); of het label en de kaart zelf geleverd worden: meten | Verordening (EU) 2017/1369; online-handleidingen SEAI, Xictron |
| **Productveiligheid (GPSR)** | Sinds 13-12-2024 bij elk online aanbod: naam en post- en e-mailadres van de fabrikant (en een verantwoordelijke in de EU als de fabrikant erbuiten zit), productidentificatie met afbeelding en type, waarschuwingen en veiligheidsinformatie in het Nederlands | Endpoint `productcompliance/{id}` en vlaggen `gpsrLabel`, `gpsrWarning` bij afbeeldingen; inhoud: meten | Verordening (EU) 2023/988 art. 19; Vimm, Shopware |
| **Oude apparaten innemen** | Bij verkoop van een nieuw elektrisch apparaat het oude gratis innemen ("oud voor nieuw"); de webshop vermeldt dat vóór de aankoop | Niets — BigBuy haalt niets op | Regeling AEEA; ID.nl, Wecycle |
| **Producentenverantwoordelijkheid** | Wie elektrische apparaten als eerste op de Nederlandse markt brengt, registreert zich bij Stichting OPEN en betaalt een afvalbeheerbijdrage. Bij inkoop in Spanje en verkoop in Nederland is dat **vermoedelijk WonZo** | n.v.t. | Stichting OPEN |
| **Levering vanuit het buitenland** | Levertijd duidelijk en juist, land van verzending, retouradres en retourkosten vooraf, KvK en btw zichtbaar | Verwerkingstijd per magazijn | ACM 22-02-2024; Consumentenbond 27-08-2024 |

Het energielabel en GPSR zijn **bouwwerk** (velden in het datacontract,
blokken op de productpagina). Inname en Stichting OPEN zijn **bedrijfswerk**
(een afspraak, een registratie, kosten in de kostprijs — D-16).

---

## 3. Features — eerste versie, later, bewust niet

### Eerste versie

| Gebied | Feature | Waarom |
|---|---|---|
| **Vinden** | Zoekveld bovenaan, groot, altijd zichtbaar, met suggesties | Het eerste wat een klant met een doel doet; BigBuy heeft geen zoekfunctie, dus zoeken op de eigen kopie (D-31) |
| | Hoofdgroepen als **beeldtegels met tekst** | HEMA doet dit; rustiger en makkelijker dan een diep uitklapmenu, en grote raakvlakken |
| | Filters: prijs, merk, beschikbaarheid, plus de 2–3 eigenschappen die per groep het meest bepalen; **meerdere waarden per filter**; de gekozen filters bovenaan met een kruisje | Baymard: 14 % van de winkels staat geen meervoudige keuze toe; 20 % toont gekozen filters niet. Filter alleen op eigenschappen met hoge dekking (`docs/SCHERMEN.md`) |
| | Sorteren: prijs, populariteit, nieuwste | Baymard; "beoordeling" pas als er echte beoordelingen zijn (D-12) |
| | Mobiel: filters in een paneel over het hele scherm, met een knop "Toon 124 producten" | Baymard: heen en weer tussen lijst en filterscherm is het grootste mobiele probleem |
| **Productpagina** | Minstens drie foto's, groot te bekijken | Baymard: 80 % toont er te weinig |
| | Koopblok: prijs incl. btw, **levertijd als bereik + land van verzending**, verzendkosten, voorraad als woord, knop "In winkelwagen" | Conclusie 1.1–1.2 |
| | Energielabel en veiligheidsinformatie waar van toepassing | Hoofdstuk 2 |
| | Specificaties als tabel; korte, gewone omschrijving | Coolblue: heldere productinformatie |
| | Bedenktijd en retour bij de knop | `docs/RETOUREN.md` |
| **Winkelwagen** | Totaal compleet, "nog € X tot gratis verzending", aantal en verwijderen makkelijk | Conclusie 1.2 |
| **Afrekenen** | Zonder account; 7–8 velden; adres uit postcode en huisnummer; iDEAL bovenaan; levertijd nog één keer | Conclusie 1.4 |
| **Na de aankoop** | Bevestigingsmail, statuspagina met token, track & trace zodra BigBuy die geeft, retour aanmelden online | `docs/MAIL.md`, `docs/RETOUREN.md` |
| **Vertrouwen** | Bedrijfsgegevens in de voettekst, contactpagina met mail en reactietijd, uitleg "zo werkt WonZo" (waar het vandaan komt, hoe lang het duurt) | Conclusie 1.3 en 1.1 |
| **Taal** | Nederlands (standaard) en Engels, wisselen met één klik, keuze onthouden | D-32 |

### Later (bewust niet in de eerste versie)

| Feature | Waarom later |
|---|---|
| Klantaccount | Verplicht account kost klanten; optioneel account voegt wachtwoorden en herstel toe (D-23) |
| Beoordelingen | Pas met echte beoordelingen; een leeg sterrensysteem wekt wantrouwen (D-12) |
| Verlanglijst, vergelijken | Handig bij een groot assortiment, niet nodig om te kunnen kopen |
| Achteraf betalen | Volgens Riverty (zelf aanbieder) wil 48 % van de consumenten het; de NOS meldt dat het bij jongeren vaker tot schulden leidt. Een keuze bij D-05 |
| Nieuwsbrief | Vraagt aparte toestemming (D-11) |
| Keurmerk (Thuiswinkel Waarborg) | Sterk vertrouwenssignaal, maar het is een lidmaatschap met eisen en kosten — keuze van de eigenaar |

### Bewust niet

- Afteltimers, "nog 2 op voorraad" als het niet waar is, "12 mensen kijken nu"
  — het brandbook verbiedt het, en ouderen haken er juist op af.
- Pop-ups bij binnenkomst, automatisch draaiende carrousels.
- Een chatbot die doet alsof hij een mens is.

---

## 4. Rustig, overzichtelijk, voor alle leeftijden — als ontwerpregels

Bovenop `docs/BRAND.md`, `docs/SCHERMEN.md` en `docs/ACCESSIBILITY.md`:

1. **Eén ding per scherm het belangrijkst.** Eén oranje knop; de rest is
   rustig. Veel witruimte; het warme paginavlak doet de rest.
2. **Tekst nooit kleiner dan 14px**, lopende tekst 16px (de typeschaal heeft
   dit al); tekst moet tot 200 % te vergroten zijn zonder dat er iets
   wegvalt.
3. **Iconen altijd met een woord erbij** (winkelwagen, zoeken, menu). Een
   icoon alleen is voor een deel van de bezoekers een raadsel.
4. **Raakvlakken minstens 44×44px**, ook links in de voettekst en het
   kruisje van een filter.
5. **Navigatie maximaal twee niveaus diep** in het menu; dieper via de
   pagina zelf. Geen menu's die openklappen bij aanwijzen.
6. **Foutmeldingen bij het veld, in gewone taal, met de oplossing**: "Vul je
   postcode in als 1234 AB" — en accepteer ook "1234ab" en "1234 ab".
7. **Alles op dezelfde plek op elke pagina**: zoeken, winkelwagen, taal,
   contact.
8. **Geen tijdsdruk**: niets verloopt terwijl de klant leest, behalve de
   betaalsessie, en die waarschuwt.

---

## 5. Voorstellen voor de set (doorgevoerd 2026-10-05)

De eigenaar ging akkoord; verwerkt in D-05, D-13, D-34, D-35, `docs/SCHERMEN.md` en `docs/api/LEVERANCIER.md`.

1. **Een nieuwe beslissing "Wettelijke productinformatie"** (D-34) (energielabel,
   GPSR, inname oude apparaten, Stichting OPEN) — `OPEN`, met een adviseur.
2. **D-13 Verzending** uitbreiden met: hoe de levertijd getoond wordt (bereik
   uit de BigBuy-gegevens plus het land van verzending), en de drempel voor
   gratis verzending.
3. **`docs/SCHERMEN.md`** aanvullen met: levertijd en land op elk scherm van
   de trechter; energielabel en veiligheidsinformatie op de productpagina;
   iconen met tekst; beeldtegels voor de hoofdgroepen.
4. **D-05 Betaaldienst**: iDEAL is een eis, niet een optie.
5. **`docs/api/LEVERANCIER.md`**: meten wat `productcompliance` en de
   energielabel-afbeeldingen van BigBuy werkelijk bevatten.

---

## Bronnen

Geraadpleegd 2026-10-05.

- Baymard Institute — Cart abandonment rate (bijgewerkt 22-09-2025):
  https://baymard.com/lists/cart-abandonment-rate
- Baymard Institute — Current state of product list and filtering UX:
  https://baymard.com/research-articles/current-state-product-list-and-filtering
- Baymard Institute — Allow applying multiple filter values:
  https://baymard.com/research-articles/allow-applying-of-multiple-filter-values
- Nielsen Norman Group — Usability for senior citizens (08-09-2019):
  https://www.nngroup.com/articles/usability-for-senior-citizens/
- Betaalvereniging Nederland — Transactiemonitor Q1 2026:
  https://www.betaalvereniging.nl/wp-content/uploads/2026/06/TMM-Q1-2026-NL.pdf
- PostNL — Trends in de Nederlandse webshopmarkt (Thuiswinkel Markt Monitor
  2025): https://www.postnl.nl/zakelijk/e-commerceplein/trends-nederlandse-webshopmarkt/
- Sendcloud — Verzendkosten als conversiekiller:
  https://www.sendcloud.com/nl/blog/verzendkosten-conversiekiller-in-e-commerce/
- Sendcloud — Meerderheid Nederlandse shoppers haakt af bij hoge
  verzendkosten: https://www.sendcloud.com/nl/blog/meerderheid-nederlandse-online-shoppers-haakt-af-bij-hoge-verzendkosten/
- Sendcloud — Het ultieme retourbeleid:
  https://www.sendcloud.com/nl/blog/de-5-onderdelen-van-het-ultieme-retourbeleid/
- ACM — Waarschuwing aan webwinkels die direct uit het buitenland leveren
  (22-02-2024): https://acm.nl/en/publications/acm-issues-warning-against-online-stores-deliver-products-directly-abroad
- Consumentenbond — Dropshippers (27-08-2024):
  https://www.consumentenbond.nl/acties-claims/nieuws/2024/dropshippers
- Emerce — SeniorWeb: ouderen en online kopen: https://www.emerce.nl/?p=834192
- Shopify NL — Webshop keurmerk: https://www.shopify.com/nl/blog/webshop-keurmerk
- MT/Sprout — De groeistrategie van Coolblue:
  https://mtsprout.nl/groei/de-groeistrategie-van-coolblue-aan-de-hand-van-de-website-van-deze-succesvolle
- Emerce — Hoe Coolblue klanten verandert in ambassadeurs:
  https://www.emerce.nl/cases/hoe-coolblue-klanten-verandert-loyale-ambassadeurs
- vidaXL — homepage: https://www.vidaxl.nl/
- HEMA — homepage: https://www.hema.nl/
- Xictron — Energielabel in de onlineshop:
  https://www.xictron.com/en/blog/energy-label-requirements-online-shop-product-data/
- SEAI — A retailer's guide to online energy labelling:
  https://www.seai.ie/publications/A-Retailers-Guide-to-Online-Energy-Labelling.pdf
- Vimm — GPSR artikel 19: https://www.vimm.be/en/blog/gpsr-article-19-product-information-webshop
- ID.nl — Elektronica recyclen via webshops:
  https://id.nl/zekerheid-en-gemak/veilig-online/beveiligingssoftware/elektronica-recyclen-zo-helpen-webshops-je-daar-bij
- Stichting OPEN — Producentenflyer (november 2024):
  https://www.stichting-open.org/wp-content/uploads/2024/11/Producentenflyer-nov-2024.pdf
- Riverty — Guide for growth NL:
  https://www.riverty.com/4a7d70/globalassets/media-ressources/merchant-package/guide-of-growth/guide-for-growth-nl.pdf
- NOS — Achteraf betalen bezorgt vooral jongeren schulden:
  https://nos.nl/l/2453816
