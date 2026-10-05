# Lijst voor livegang — WonZo

Niet afvinken wat je niet zelf gecontroleerd hebt. Stappen met een echte
betaling, terugbetaling, inkooporder of productie-uitrol voert **de eigenaar**
uit, niet Claude.

## Juridisch — dit moet er staan vóór de eerste bestelling

`WETTELIJK`-punten: laten bevestigen door een adviseur voor de markt van de
winkel. Dit is een herinneringslijst, geen juridisch advies.

- [ ] **Bedrijfsgegevens** op de site: handelsnaam, adres, mailadres, KvK- en
      btw-nummer (`WETTELIJK`: o.a. BW 3:15d en 6:230m). Het is ook het eerste
      waar een klant naar zoekt als hij twijfelt.
- [ ] **Algemene voorwaarden**, bereikbaar vóór het afrekenen.
- [ ] **Privacyverklaring** die klopt met `docs/PRIVACY.md`, met een datum.
- [ ] **Herroepingsrecht**: 14 dagen, duidelijk benoemd, met het modelformulier
      beschikbaar.
- [ ] **Prijzen inclusief btw** voor consumenten, en verzendkosten zichtbaar
      vóór de laatste stap.
- [ ] De bestelknop zegt wat er gebeurt ("Bestellen en betalen"), niet
      "Versturen".
- [ ] Bevestiging per mail met: wat er besteld is, het bedrag, de btw, het
      herroepingsrecht en de bedrijfsgegevens.
- [ ] Is er een "van/voor"-prijs? Dan de referentieprijs volgens
      `docs/PRIJZEN.md` § De "van"-prijs, en de geschiedenis moet al lopen.
- [ ] Beoordelingen? Dan geen selectie op gunstigheid, en alleen van mensen die
      echt gekocht hebben.

## Prijzen en kortingen

- [ ] Een actie die de marge raakt wordt getrimd, en het paneel zegt dat
- [ ] Twee acties op één artikel: de hoogste wint
- [ ] Geen doorgestreepte prijs zonder 30 dagen prijsgeschiedenis
- [ ] Een code werkt niet op artikelen die al in de actie zijn
- [ ] Een code maakt een bestelling nooit duurder (gratis-verzendgrens)
- [ ] Pagina, winkelwagen en afrekenscherm tonen hetzelfde bedrag

## Betalen

- [ ] Testbetaling met een echte methode in de live omgeving (eigenaar).
- [ ] Webhook komt aan, handtekening wordt geverifieerd, en een tweede
      bezorging levert geen dubbele mail.
- [ ] Een afgebroken betaling zet de order op `PAYMENT_FAILED`, en die
      verloopt netjes naar `CANCELLED`.
- [ ] Reconciliatie draait en vindt een bewust gemiste webhook terug.
- [ ] **Een terugbetaling één keer echt uitgevoerd** (eigenaar, klein bedrag).
      Alles eromheen testen bewijst niet dat de keten werkt.
- [ ] Het bedrag dat de betaaldienst ziet komt uit de bevroren snapshot.
- [ ] De live-sleutel staat alleen in productie.

## Mail

- [ ] SPF, DKIM en DMARC ingesteld voor het domein.
- [ ] Een echte mail ontvangen in Gmail én in Outlook, niet in de map
      ongewenst.
- [ ] Afzender is een adres op het eigen domein.
- [ ] De beheerder krijgt een bericht bij elke bestelling, met alles wat hij
      nodig heeft om te zien wat er verkocht is.

## Factuur

- [ ] Alle wettelijke velden staan erop (zie `docs/FACTUUR.md`)
- [ ] Het nummer volgt op het vorige, zonder gat
- [ ] Een naam met accenten en een bedrag met een euroteken komen goed door
- [ ] De btw op de factuur is gelijk aan die in de bevestigingsmail
- [ ] De link naar de PDF is niet te raden

## Beveiliging

- [ ] `pnpm audit` zonder meldingen.
- [ ] Geen sleutel in Git, ook niet in de geschiedenis. Ooit toch gestaan?
      Roteren.
- [ ] Beheerpaneel op noindex en uit de sitemap en robots.
- [ ] Inloggen met tweede factor.
- [ ] Beveiligingsheaders en CSP ingesteld (`.claude/rules/beveiliging.md`).
- [ ] Een limiet op inloggen, codes en formulieren die mail of externe calls
      veroorzaken.
- [ ] Database niet open voor het hele internet.
- [ ] Autorisatie- en IDOR-tests groen (`docs/TESTEN.md`).
- [ ] `docs/THREAT_MODEL.md` nagelopen voor de gekozen providers.

## Operations

- [ ] `main` beschermd op de remote; CI vereist voor merge (`docs/CI_CD.md`).
- [ ] Health checks (`/healthz`, `/readyz`) en de alerts uit
      `docs/OBSERVABILITY.md` werken — één alert bewust laten afgaan.
- [ ] Error tracking ontvangt een testfout, zonder persoonsgegevens.
- [ ] Backups draaien én **een restore is getest** (`docs/DISASTER_RECOVERY.md`).
- [ ] Rollback van een release geoefend.
- [ ] Opstartvalidatie weigert te starten bij een ontbrekende variabele.

## Toegankelijkheid

- [ ] Checkout volledig met toetsenbord en met een schermlezer doorlopen.
- [ ] Contrasttabel in `docs/BRAND.md` ingevuld voor licht (en donker, als
      D-33 een donkere modus kiest).
- [ ] Factuur-PDF getagd (`docs/ACCESSIBILITY.md`).
- [ ] D-20 (juridische toepasselijkheid) beantwoord.

## Techniek

- [ ] `pnpm build` slaagt op de machine waar hij straks draait.
- [ ] 404 geeft echt status 404, geen 200 met een foutpagina.
- [ ] sitemap.xml en robots.txt kloppen.
- [ ] Taalvarianten verwijzen naar elkaar.
- [ ] Werkt zonder JavaScript voor het belangrijkste pad? Minstens: zoeken en
      bladeren.
- [ ] Getest op een echte telefoon, niet alleen in een versmald venster.
- [ ] Donkere modus doorlopen — alleen als D-33 er een kiest.
- [ ] Toetsenbord: van het begin tot het afrekenen, zonder muis.
- [ ] Een trage verbinding nagebootst en gekeken wat er dan op het scherm staat.

## Beheerpaneel

- [ ] Een bestelling van begin tot eind afgehandeld: bekijken, controleren
      dat de inkoop bij de leverancier automatisch gelukt is, factuur openen.
- [ ] Een inkoop met te weinig tegoed (sandbox) belandt in "vraagt aandacht"
      en er gaat een melding uit.
- [ ] Een retour doorlopen tot en met de terugbetaling.
- [ ] Een mislukt formulier houdt zijn waarden.
- [ ] Werkt op een telefoon voor de drie dingen die haast hebben: bestelling
      bekijken, zien of de inkoop gelukt is, retour afhandelen.
- [ ] Het logboek toont wie wat deed.

## Na de eerste echte bestelling

- [ ] Kwam de bevestiging aan bij de klant?
- [ ] Kwam het bericht aan bij de beheerder?
- [ ] Klopt het factuurnummer, en volgt het op het vorige?
- [ ] Klopt het bedrag met wat de betaaldienst meldt?
- [ ] Is de inkoop bij de leverancier gelukt tegen de prijs waarmee gerekend is?

Die laatste is de belangrijkste. Zit er verschil tussen de prijs waarop je
verkocht hebt en de prijs waarvoor je kunt inkopen, dan zit er iets fout in de
koppeling tussen prijs en aanbieding — en dat kost bij elke bestelling geld
tot het gevonden is.
