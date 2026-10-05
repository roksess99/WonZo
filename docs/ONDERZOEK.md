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

## 6. Het assortiment bij BigBuy — wat WonZo kan verkopen

Onderzoek op verzoek van de eigenaar (2026-10-05): welke producten en
categorieën kan WonZo verkopen zonder de zware wettelijke eisen van
bijvoorbeeld elektronica.

GEMETEN 2026-10-05 — productie, alleen lezen, `scripts/explore-catalog.mjs`
(alle pagina's, koppeling op product-id); voorraad gecontroleerd door de
eigenaar in het BigBuy-account (`docs/api/LEVERANCIER.md` § 7). Acht
hoofdgroepen: Huis en koken, Tuin, Doe-het-zelf en gereedschap, Verlichting,
Bagage, Kantoorartikelen, Dierproducten, Sport en outdoor.

**Eerst dit:** geen enkele categorie is vrij van regels. De productveiligheid
(GPSR) geldt voor elk consumentenproduct. De vraag is welke categorieën
**alleen** die basis hebben. De indeling hieronder volgt uit de douanecode van
elk artikel (`intrastat`) plus een controle op de naam; het is een eerste
schifting, geen juridisch oordeel (`WETTELIJK`, te bevestigen).

| Zwaarte | Wat erbij komt | Voorbeelden |
|---|---|---|
| **basis** | alleen GPSR en consumentenrecht | meubels, opslag, decoratie, kaarsen, koffers en tassen, handgereedschap, sportartikelen |
| **licht** | één extra etiketteringsregel | textiel (vezelsamenstelling), servies en keukengerei (materiaal dat met voedsel in aanraking komt), messen |
| **zwaar** | een eigen registratie- of keurregime | elektrisch (D-34), verlichting, speelgoed, cosmetica, voeding, chemische middelen, optisch en medisch |

### 6.1 De cijfers

| | Aantal |
|---|---|
| Producten in de acht groepen | 132 582 |
| Nieuw, actief en op voorraad | **1 044** (0,8 %) |
| Daarvan basis of licht | 764 |
| Daarvan zonder elektrisch kenmerk in de naam | **739** |
| Daarvan met voorraad ≥ 20 stuks | 103 — waarvan **89 van InnovaGoods** |
| Daarvan met inkoop ≥ € 5 | 343 |

Per groep (nieuw, op voorraad, basis of licht, niet elektrisch):

| Groep | Artikelen | Voorraad ≥ 20 | Inkoop ≥ € 5 | Oordeel |
|---|---|---|---|---|
| Huis en koken | 426 | 54 | 190 | **Kern van WonZo** |
| Kantoorartikelen | 120 | 5 | 48 | Vooral schooltassen en schriften; past matig |
| Sport en outdoor | 98 | 26 | 58 | Kamperen en thuis sporten passen; zie de kanttekening |
| Tuin | 40 | 10 | 28 | **Klein maar passend** |
| Dierproducten | 26 | 5 | 11 | Klein; alleen halsbanden, manden, kleding |
| Bagage | 19 | 2 | 3 | Te klein en te goedkoop |
| Doe-het-zelf | 10 | 1 | 5 | Vrijwel niets leverbaar (0,2 %) |
| Verlichting | 0 | — | — | Alles elektrisch: vermijden |

### 6.2 Wat de cijfers betekenen

1. **Het aanbod is klein en wisselend.** Ongeveer 99 % van de catalogus is op
   een gegeven moment niet leverbaar. WonZo wordt een overzichtelijke winkel
   met honderden artikelen, geen catalogus van tienduizenden — dat past bij
   "rustig en overzichtelijk", maar het aanbod verandert voortdurend.
2. **De meeste voorraad is ondiep.** Van de 764 kandidaten hebben er 571 maar
   1 tot 4 stuks. Zulke artikelen zijn weg voordat een klant afrekent, tenzij
   de voorraad vlak vóór de betaling opnieuw wordt gecontroleerd (D-31, D-22).
3. **De stabiele voorraad is vooral één merk.** 89 van de 103 artikelen met
   20 stuks of meer zijn van **InnovaGoods** (fabrikant volgens GPSR: Nine New
   Investments S.L., Spanje): handige gadgets voor huis en keuken, vaak met
   honderden tot duizenden stuks voorraad. Dat is de ruggengraat die altijd
   leverbaar is — maar het is een uitgesproken soort product. Of dat bij de
   uitstraling van WonZo past, is een keuze van de eigenaar.
4. **Veel artikelen zijn erg goedkoop.** 325 van de 764 kosten minder dan € 3
   inkoop. Alleen verzonden kost zo'n artikel meer aan verzending dan het
   oplevert: een minimumbestelling of een ondergrens hoort bij D-13 en D-03.
5. **Levertijd is goed.** Alle kandidaten hebben 0–1 dag verwerkingstijd. Met
   de vervoerder erbij (2–5 dagen, `docs/api/LEVERANCIER.md` § 10) is
   "3–6 werkdagen" een eerlijke belofte.
6. **GPSR-gegevens ontbreken soms.** In twee steekproefrondes gaven 11 van
   de 41 controles geen fabrikantgegevens. Zo'n artikel hoort niet in de winkel tot
   de gegevens er zijn (D-34).
7. **Gereviseerde artikelen** zitten vooral in Huis en koken (39 van de 584
   op voorraad) en Sport (26 van de 167). Ze zijn in deze cijfers al
   weggelaten.
8. **Seizoen en licenties.** 70 kandidaten zijn kerstartikelen (nu
   leverbaar, over drie maanden niet); 46 dragen een licentiefiguur (Disney,
   Peppa Pig, Spider-Man) en zijn vooral voor kinderen.
9. **Kanttekening Sport:** 5152 producten in Sport hebben varianten (maten,
   kleuren) en maar 5646 een voorraadregel. De voorraad van varianten staat in
   een apart endpoint dat nog niet is gemeten; Sport kan meer leverbare kleding
   hebben dan hier staat.
10. **De douanecode mist soms iets.** 25 artikelen met "elektrisch",
    "oplaadbaar", "USB" of "koeling" in de naam hadden een niet-elektrische
    code (een elektrische deken als textiel, een bierdispenser met koeling
    als keukengerei). De naamcontrole hoort dus in de selectie, plus een
    menselijke blik op wat er overblijft.

### 6.3 Aanbevolen subcategorieën

Geschikt voor de eerste versie — basis of licht, leverbaar, passend bij
"wonen" (de oorsprong van de naam):

| Groep | Subcategorie | Zwaarte | Waarom |
|---|---|---|---|
| Huis en koken | Opslag en organisatie (keuken, kleding, was, badkamer) | basis | Veel InnovaGoods met diepe voorraad, € 7–30 inkoop |
| Huis en koken | Meubilair (lounge, kantoor, bijzettafels) | basis | Hogere prijzen, diepe voorraad |
| Huis en koken | Huisdecoratie (accessoires, muurdecoratie, kaarsen en kandelaars) | basis | Breed aanbod; vaak ondiepe voorraad |
| Huis en koken | Woningtextiel (kussens, plaids, keukentextiel, beddengoed) | licht | **Later** (D-36): vraagt registratie bij UPV Textiel |
| Huis en koken | Servies, keukengerei, bargerei | licht | Materiaal voor voedselcontact; meestal goedkoop |
| Tuin | Tuinmeubelen, parasols, bewatering, houtskoolbarbecues en accessoires | basis | Klein maar passend; seizoensgebonden |
| Sport en outdoor | Kampeermeubelen en slaapuitrusting; thuis sporten (spieropbouw) | basis | Diepe voorraad, hogere prijzen; zwaar om te verzenden |
| Dierproducten | Halsbanden en tuigen, manden en dekens | basis | Klein; merken als Trixie en Julius-K9 |

**Vermijden in de eerste versie** (zwaar, of niet passend): alles
elektrisch, verlichting, ongediertebestrijding (elektrisch of biociden),
speelgoed, cosmetica en verzorging, voeding (ook dierenvoer), chemische
middelen (verf, schoonmaak), doe-het-zelf (vrijwel niets leverbaar), en de
hoofdgroep voor volwassenen.

### 6.4 Voorstel voor de selectieregel (D-02)

Een artikel komt in de winkel als het aan **alle** regels voldoet; afgedwongen
in de code, niet als filter in de navigatie:

1. Het valt in een toegestane subcategorie (lijst hierboven, door de eigenaar
   vastgesteld). Gezocht op naam in de taxonomieboom, niet op vast id, tot de
   stabiliteit van de id's gemeten is (`.claude/rules/catalogus.md`).
2. De douanecode valt in **basis** of **licht**.
3. De naam bevat geen elektrisch kenmerk; twijfelgevallen gaan naar een lijst
   die de eigenaar nakijkt.
4. Conditie **nieuw** (of gereviseerd, als de eigenaar dat kiest, en dan
   duidelijk zo getoond).
5. **Voorraad > 0**, vers gecontroleerd bij het afrekenen.
6. **GPSR-gegevens aanwezig** (fabrikant met adres).
7. Een prijsondergrens of minimumbestelling — de waarde hoort bij D-03 en
   D-13.

---

## 7. Andere eisen en voorwaarden per categorie

Onderzoek op verzoek van de eigenaar (2026-10-05): welke registraties,
bijdragen en productregels gelden er voor de categorieën uit § 6 — zoals
Stichting OPEN voor elektrische apparaten. Alles hieronder is `WETTELIJK`
(of `GEDOCUMENTEERD` bij de genoemde bron) en **te bevestigen door een
adviseur**; dit is een overzicht om de juiste vragen te kunnen stellen, geen
juridisch advies.

### 7.1 Twee rollen tegelijk

| Soort regel | Rol van WonZo | Waarom | Gevolg |
|---|---|---|---|
| Productveiligheid (EU: GPSR, voedselcontact, beschermingsmiddelen) | **Distributeur** | Gekocht bij een leverancier in de EU (BigBuy, Spanje); "importeur" is in EU-recht wie van buiten de EU invoert | Controleren dat de fabrikant het geregeld heeft; documenten kunnen opvragen; geen eigen keuring |
| Afval en producentenverantwoordelijkheid (Nederlandse UPV) | **Producent of importeur** | WonZo brengt het product als eerste op de Nederlandse markt. KVK: wie textiel bij een Nederlands bedrijf koopt heeft geen verplichtingen — wie in het buitenland koopt wel | Registreren, rapporteren en een bijdrage betalen per productstroom |

### 7.2 Voor de hele winkel

| Regel | Wat het is | Wat WonZo moet doen |
|---|---|---|
| **Verpakkingen** (Verpact, voorheen Afvalfonds) | Wie verpakte producten als eerste in Nederland op de markt brengt, is verantwoordelijk voor het verpakkingsafval | Onder 50 000 kg verpakking per jaar: **geen aangifte, wel bijhouden hoe je dat berekend hebt**. Wegwerpplastic-verpakkingen altijd melden |
| **Verpakkingsverordening (PPWR)**, sinds 12-08-2026 | Nieuwe EU-regels voor alle verpakkingen; zwaardere eisen vanaf 2028 en 2030 | Als distributeur die bij een EU-leverancier koopt: weinig directe plichten, wel nagaan dat de leverancier voldoet. **Verstuurt BigBuy in een doos met de naam van WonZo, dan kan WonZo "fabrikant" van die verpakking worden** — navragen |
| **Ontbossingsverordening (EUDR)**, voor kleine bedrijven vanaf 30-12-2026 | Hout, papier, houtskool, rundleer, rubber en producten daarvan moeten ontbossingsvrij zijn | Als handelaar binnen de EU: **administratie bijhouden** — van wie gekocht, met het referentienummer van de verklaring (DDS) van de leverancier |
| **REACH artikel 33** | Een consument mag vragen of een product een zeer zorgwekkende stof bevat (boven 0,1 %) | **Binnen 45 dagen antwoorden**, gratis. De SCIP-database geldt niet voor winkels die alleen aan consumenten verkopen. Afspraak met BigBuy over die informatie |
| **Productveiligheid (GPSR)** en **ACM-regels voor levering uit het buitenland** | Zie § 2 en D-34 | Per artikel de fabrikantgegevens; levertijd, land, retouradres en -kosten |

### 7.3 Per categorie

| Categorie | Extra regel | Wat WonZo moet doen | Advies eerste versie |
|---|---|---|---|
| **Woningtextiel** (dekbedovertrekken, lakens, handdoeken, theedoeken, tafellinnen) | **UPV Textiel** (sinds 1-7-2023), geen minimumhoeveelheid; plus **textieletikettering** (vezelsamenstelling, Verordening 1007/2011) | Registreren, jaarlijks rapporteren, **afvalbeheersbijdrage** per kilo, of lid worden van een producentenorganisatie (bijv. Stichting UPV Textiel). Vezelsamenstelling op de productpagina | **Later** (D-36). Of sierkussens en plaids onder "huishoudtextiel" vallen: navragen |
| **Matrassen en toppers** | **UPV Matrassen** (sinds 2022); verwijderingsbijdrage 2026: € 7,50 eenpersoons, € 9,00 tweepersoons | Registreren en bijdrage per stuk | **Weglaten** |
| **Servies, keukengerei, bargerei, lunchboxen, drinkflessen** | **Voedselcontactmaterialen** (Verordening 1935/2004, Warenwet); **BPA-verbod** (Verordening 2024/3190): sinds 20-07-2026 mogen de meeste artikelen met BPA niet meer voor het eerst op de markt | Bij BigBuy de conformiteitsverklaring voor kunststof artikelen kunnen opvragen; controleren dat het artikel geschikt is voor levensmiddelen | **Ja**, met die documenten |
| **Wegwerpplastic** (feestbekers, -borden, bestek, rietjes, bakjes) | **Verbod** op o.a. plastic wegwerpbestek, -borden en -rietjes (EU 2019/904); UPV voor wegwerpbekers en -bakjes | — | **Weglaten** |
| **Kaarsen en kandelaars** | GPSR; brandveiligheidswaarschuwingen (norm EN 15494) | Controleren dat de waarschuwingen meekomen (GPSR-gegevens) | **Ja** |
| **Meubels** (binnen en tuin) | GPSR; **EUDR** voor houten meubels; **UPV Meubels** komt eraan (uiterlijk 2030 volgens het programma circulaire economie) | EUDR-administratie; UPV volgen | **Ja** |
| **Opslag, organisatie, decoratie** | GPSR | — | **Ja** |
| **Tuin: houtskoolbarbecues, parasols, bewatering** | GPSR; **houtskool** valt onder EUDR | EUDR-administratie bij houtskool | **Ja**; gasbarbecues (gastoestellenverordening) en ongediertebestrijding (biociden) **weglaten** |
| **Sport: kamperen, thuis sporten** | GPSR (fitness: norm ISO 20957) | — | **Ja** |
| **Sport: zwemhulpmiddelen, opblaasbaar voor water, beschermers en helmen** | Speelgoedrichtlijn, norm voor zwemhulpmiddelen (EN 13138) of **persoonlijke beschermingsmiddelen** (Verordening 2016/425, CE) | CE en documenten per artikel | **Weglaten** |
| **Zonnebrillen** (ook in pakketten, bijv. InnovaGoods) | **Persoonlijk beschermingsmiddel** categorie I: CE-markering en EU-conformiteitsverklaring | CE controleren | **Weglaten** of per artikel controleren |
| **Dieren: halsbanden, tuigen, manden, kleding** | GPSR | — | **Ja**; dierenvoer (diervoederregels), shampoo en verzorging **weglaten**; LED-halsbanden bevatten een batterij |
| **Kantoor en school: schriften, papier** | **EUDR** (papier) | EUDR-administratie | **Ja** |
| **Kinderartikelen** (rugzakken met figuren, etuis) | Grens met **speelgoed**: wat bedoeld is om mee te spelen door kinderen onder 14 valt onder de speelgoedrichtlijn | Twijfelgevallen weren | **Voorzichtig**; geen speelgoed |
| **Messen** | Een wettelijke leeftijdsgrens (18) is in voorbereiding; grote winkels (Action, HEMA, IKEA) verkopen al vrijwillig niet aan minderjarigen | Leeftijdscontrole bij afrekenen | **Weglaten** in de eerste versie (4 artikelen) |
| **Alles met een batterij** (ook led-decoratie) | **Batterijverordening** 2023/1542: producentenregistratie (in Nederland via Stichting OPEN) | Registreren | **Weglaten** via de naamcontrole uit § 6 |

### 7.4 Wat WonZo als bedrijf moet regelen

Bij het aanbevolen assortiment uit § 6.3, zonder woningtextiel:

1. **Verpact:** bijhouden hoeveel kilo verpakking er op de markt komt, en hoe
   dat berekend is (waarschijnlijk ver onder 50 000 kg).
2. **EUDR:** vanaf 30-12-2026 per leverancier de DDS-referenties bewaren voor
   hout, papier en houtskool.
3. **REACH:** een vaste weg om een vraag over zorgwekkende stoffen binnen 45
   dagen te beantwoorden.
4. **Documenten van BigBuy** kunnen opvragen: GPSR, conformiteitsverklaringen
   voor voedselcontact (en BPA-vrij), EUDR-referenties.

Met woningtextiel erbij komt daar **UPV Textiel** bij: registratie, jaarlijkse
rapportage en een bijdrage.

### 7.5 Vragen voor de adviseur

1. Is WonZo voor de Nederlandse UPV (textiel, verpakkingen) producent,
   terwijl BigBuy rechtstreeks uit Spanje aan de Nederlandse klant levert?
2. Vallen sierkussens, plaids en keukentextiel onder UPV Textiel?
3. Wat moet WonZo als kleine handelaar onder de EUDR bijhouden, en vanaf
   wanneer precies?
4. Oud-voor-nieuw en Stichting OPEN (D-34), als er toch elektrische artikelen
   bij komen.
5. Is er inmiddels een wettelijke leeftijdsgrens voor de verkoop van messen?

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
- Ondernemersplein — Afvalbeheersbijdrage verpakkingen betalen:
  https://ondernemersplein.overheid.nl/wetten-en-regels/afvalbeheersbijdrage-verpakkingen-betalen/
- KVK — UPV textiel: https://www.kvk.nl/duurzaamheid/upv-textiel-dit-betekent-het-voor-jou/
- Ondernemersplein — Nieuwe regels voor hergebruik en recycling textiel:
  https://ondernemersplein.overheid.nl/duurzaam-ondernemen/milieu/nieuwe-regels-voor-hergebruiken-en-recyclen-textiel/
- KVK — Wegwerpplastic: https://www.kvk.nl/duurzaamheid/producent-of-importeur-van-wegwerpplastic-dit-moet-je-regelen/
- KVK — UPV batterijen: https://www.kvk.nl/duurzaamheid/upv-batterijen-en-accus-regels-voor-producent-en-importeur
- Knab — Nieuwe verpakkingsregels vanaf 12 augustus (17-08-2026):
  https://bieb.knab.nl/ondernemen/nieuwe-verpakkingsregels-ppwr-2026
- Douane — EUDR: https://www.douane.nl/onderwerpen/vgem/milieu/eudr/
- Ondernemersplein — EUDR: https://ondernemersplein.overheid.nl/duurzaam-ondernemen/milieu/verordening-ontbossingsvrije-producten-eudr-wat-betekent-dit-voor-u/
- Interior Daily — Verwijderingsbijdrage matrassen 2026:
  https://www.interiordaily.com/article/9784708/disposal-fee-for-mattresses-set-for-2026/
- HVC — Status en ontwikkeling UPV (2025):
  https://connect.hvcgroep.nl/rs/944-ZXB-764/images/05_HVC%20Congres%202025_Status%20%26%20ontwikkeling%20van%20UPV_Jochem%20Ballot%20%26%20Paul%20Hofman.pdf
- Food Packaging Forum — EU BPA ban reaches main transition deadline:
  https://foodpackagingforum.org/news/eu-bpa-ban-reaches-main-transition-deadline
- NVWA — Interventiebeleid voedselcontactmaterialen:
  https://www.nvwa.nl/binaries/nvwa/documenten/nvwa/organisatie/hoe-de-nvwa-werkt/specifiek-interventiebeleid/voedselcontactmaterialen-ib02-spec-61-versie-01/IB02-SPEC61-versie01-voedselcontactmaterialen.pdf
- Händlerbund — Kennzeichnung von Textilien:
  https://www.haendlerbund.de/de/news/aktuelles/rechtliches/2543-richtige-kennzeichnung-von-textilien-so-schuetzen-sie-sich-vor-abmahnungen
- Verordening (EU) 2016/425 persoonlijke beschermingsmiddelen:
  https://www.legislation.gov.uk/eur/2016/425/data.html
- CBL — Messenverkoop alleen aan 18+ (januari 2022):
  https://www.cbl.nl/app/uploads/2022/01/QA-Messenverkoop-alleen-aan-18-januari-2022.pdf
- CMS — SCIP-database: https://cms.law/en/aut/legal-updates/SCIP-Database-a-step-forward-for-the-circular-economy
- Riverty — Guide for growth NL:
  https://www.riverty.com/4a7d70/globalassets/media-ressources/merchant-package/guide-of-growth/guide-for-growth-nl.pdf
- NOS — Achteraf betalen bezorgt vooral jongeren schulden:
  https://nos.nl/l/2453816
