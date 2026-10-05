# Mail — welke berichten er zijn, en wat erin moet

Mail is het enige deel van de winkel waar je geen tweede kans hebt: komt hij
niet aan, dan belt de klant of hij komt niet terug. En je ziet het niet, want
een mail die in de map ongewenst belandt is voor jou gewoon verstuurd.

---

De factuur-PDF heeft zijn eigen regels en staat in `docs/FACTUUR.md`.

## Welke berichten bestaan er

| Bericht | Naar | Wanneer |
|---|---|---|
| Bevestiging van de bestelling | klant | zodra de betaling rond is |
| Melding van een bestelling | beheerder | hetzelfde moment |
| Inkoop mislukt of onbekend | beheerder | zodra een inkooporder `REJECTED` of `UNKNOWN` wordt |
| Tegoed bij de leverancier laag | beheerder | onder de drempel (`docs/OBSERVABILITY.md`) |
| Verzonden | klant | bij het verzenden |
| Retour ontvangen / terugbetaald | klant | bij de afhandeling |
| Uitnodiging voor een beoordeling | klant | dagen na levering |
| Wachtwoord of uitnodiging beheerder | beheerder | |

**De bevestiging hangt aan de betaalstatus, niet aan de terugkeerpagina.** Een
klant die zijn tabblad sluit heeft wél betaald en hoort zijn mail te krijgen.

---

## Wat er in de bevestiging moet (`WETTELIJK`, NL/EU — te bevestigen)

Afgeleid van de informatieplicht bij overeenkomsten op afstand (BW 6:230v,
Richtlijn 2011/83/EU art. 8 lid 7). Laat de definitieve tekst controleren.

- Wat er besteld is, met aantallen en prijzen per stuk
- Het totaalbedrag, het btw-bedrag en de verzendkosten apart
- De bedrijfsgegevens: naam, adres, KvK- en btw-nummer
- Het herroepingsrecht, met de termijn en hoe de klant het gebruikt
- Het modelformulier voor herroeping, of een link ernaartoe

Zet dit in de mail zelf en niet alleen achter een link: de mail is de
bevestiging, en die moet op zichzelf kloppen.

---

## De mail aan de beheerder

Inkopen gebeurt automatisch (D-04); de beheerder hoeft met deze mails niets
over te nemen. Hij leest ze op zijn telefoon.

**De bestelmelding** is kort en geen kopie van de klantmail: ordernummer,
bedrag, een tabel met artikelnummer (zoals de leverancier het kent), aantal en
prijs, en een link naar de bestelling in het beheerpaneel.

**De melding dat een inkoop mislukte of onbekend is** is de belangrijke: daar
moet een mens iets mee. Ze zegt welke bestelling, wat de leverancier
antwoordde (of dat er geen antwoord kwam), of de klant al betaald heeft, en
een link naar de bestelling. Wat de beheerder daarna mag doen, is nog open in
D-04.

---

## De sjablonen

### Één gedeelde stijl, niet per mail opnieuw

Zet kleuren, lettertypen, de randkleur en een ontsmettingsfunctie in **één
module** die elke mail importeert. Zonder dat drijven de berichten binnen een
maand uit elkaar: de ene bevestiging heeft een andere grijstint dan de andere,
en niemand ziet waar dat vandaan komt.

```
mail/style.ts     kleuren, lettertypestapel, escapeHtml()
mail/layout.ts    het omhulsel: buitenste tabel, kaart, kop- en voetblok
mail/<bericht>.ts per bericht alleen de inhoud
```

### Het omhulsel

```
<buitenste tabel, 100% breed, achtergrondkleur>
  <kaart, 600-720px, gecentreerd, eigen achtergrond>
     kopblok       logo (PNG), eventueel een regel eronder
     inhoud        per bericht verschillend
     voetblok      bedrijfsgegevens, contact, en waarom je deze mail krijgt
```

Die laatste regel in het voetblok — "je krijgt dit bericht omdat je bij ons
besteld hebt" — scheelt klachten en meldingen als ongewenst.

### Per bericht: welke blokken, in welke volgorde

**Bevestiging van de bestelling** (de belangrijkste; de klant leest alleen de
eerste helft)

1. Eén zin: bedankt, en het is gelukt
2. Ordernummer en datum
3. **De tabel met wat er besteld is**, met aantal, prijs per stuk, regeltotaal
4. Subtotaal, korting, verzendkosten, btw, totaal
5. Afleveradres
6. Wat er nu gebeurt en wanneer
7. Link naar de status van de bestelling (met token)
8. Herroepingsrecht, met de termijn en de link naar het formulier
9. Bedrijfsgegevens

**Melding aan de beheerder** — zie hierboven: kort, geen kopie van de klantmail.

**Verzonden**: ordernummer, wat er onderweg is, het trackingnummer als je dat
hebt, en wanneer het er ongeveer is.

**Retour terugbetaald**: het bedrag, het retournummer, dat het teruggaat naar
de rekening waarmee betaald is, en dat het een paar werkdagen kan duren.

**Beoordelingsuitnodiging**: kort, één knop, en één per bestelling.

### Onderwerpregels

| Bericht | Onderwerp |
|---|---|
| Bevestiging | `Bestelling <nummer> ontvangen` |
| Beheerder | `Nieuwe bestelling <nummer> — <bedrag>` |
| Verzonden | `Bestelling <nummer> is onderweg` |
| Terugbetaald | `Retour <nummer> terugbetaald` |

Concreet en met het nummer erin. Dan is de mail terug te vinden met zoeken, en
dat is wat een klant doet als hij belt.

### Voorvertoningstekst

De eerste regel die een mailclient naast het onderwerp toont. Vul hem bewust
met een korte samenvatting, anders staat er "Bekijk deze mail in uw browser" of
de eerste woorden van je kopblok.

### Beeld

- **Logo als PNG** met een absolute URL. SVG werkt niet in mailclients.
- **Ga ervan uit dat beelden geblokkeerd zijn.** Veel clients laden ze niet
  zonder toestemming. Alles wat de klant moet weten staat dus in tekst; een
  beeld voegt hoogstens toe. Geef elk beeld een `alt`.
- Geen productfoto's in de bevestiging. Ze maken de mail zwaar, ze komen van
  het domein van de leverancier, en ze zeggen niets dat de regel niet zegt.

### Links

- Absolute URL's, met de taal erin.
- Een link naar de bestelstatus draagt een token; het ordernummer alleen is
  niet genoeg (zie `.claude/rules/beveiliging.md`).
- Niet "klik hier" maar een link die zegt waar hij heen gaat.

### De tekstversie is geen bijzaak

Dezelfde feiten, in dezelfde volgorde. Een tekstversie die minder zegt dan de
HTML is een halve mail voor iedereen die geen HTML krijgt — en bij een
beheerdersmail is dat vaak degene die haast heeft.

### Voorvertoning tijdens het bouwen

Maak een adres waarop je elke mail in de browser kunt bekijken met een
voorbeeldbestelling erin, inclusief de rare gevallen: een lange productnaam,
twintig regels, een naam met accenten, een bedrag van € 0,01. Dan zie je de
opmaak zonder te versturen, en je ziet de fouten voordat een klant ze ziet.

---

## Techniek

**Altijd twee versies.** HTML én platte tekst. Niet elke client toont HTML, en
een mail zonder tekstversie scoort slechter bij spamfilters.

**HTML voor mail is geen HTML voor het web.** Wat je moet weten:

- Tabellen voor de opmaak, geen flex of grid.
- Stijlen inline, geen stylesheet.
- Geen SVG — gebruik PNG voor het logo.
- Vaste breedte van zo'n 600–720 px, en percentages voor de kolommen zodat het
  op een telefoon niet overloopt.
- Geen `white-space: nowrap` in een cel met tekst: dat is precies wat een tabel
  op een smal scherm uit beeld duwt.
- Donkere modus bestaat ook in mailclients. Zet achtergrond- én tekstkleur
  expliciet, nooit alleen één van de twee.

**Elke waarde die in de HTML komt wordt ontsmet.** Een naam met een `<` erin
hoort geen opmaak te worden. Dat geldt ook voor wat de leverancier levert.

---

## Aankomen

- **SPF, DKIM en DMARC** ingesteld voor het domein. Zonder deze drie is je mail
  in de meeste postbussen verdacht.
- De afzender is een adres **op het eigen domein**. Niet een gratis adres, en
  niet het adres van de klant als afzender.
- Een `Reply-To` dat door een mens gelezen wordt.
- **Test in meerdere postbussen.** Minstens een grote webmaildienst en een
  zakelijke. Kijk ook in de map ongewenst — dat is het hele punt van de test.
- Stuur geen bijlagen als het niet hoeft; een factuur als PDF mag, een PDF van
  drie megabyte niet.

---

## Als het misgaat

**Een mislukte mail mag de bestelling niet omgooien.** De betaling is binnen,
het artikel is verkocht; dat de bevestiging niet wegging is een probleem om op
te lossen, niet om de afhandeling mee af te breken. Mail gaat daarom via een
**outbox**: het record wordt in dezelfde transactie als de statusovergang
geschreven en daarna los verstuurd, met backoff (`docs/IDEMPOTENCY.md` §
Mail). Na N mislukte pogingen staat hij in de tegel "vraagt aandacht".

**Maar laat hem ook niet verdwijnen.** Zet een vinkje dat de mail verstuurd is,
en zet dat vinkje pas ná een geslaagde verzending. Anders stuurt een webhook
die twee keer komt ook twee bevestigingen — of erger: hij blijft het een dag
lang proberen omdat de afhandeling telkens op een fout stukloopt, en de klant
krijgt elke keer een nieuwe mail.

---

## Tijdens het ontwikkelen

- Zet een schakelaar waarmee mail naar een testadres gaat in plaats van naar de
  klant, of blokkeer uitgaande mail op de ontwikkelmachine.
- Bouw een controlescript dat één testmail stuurt, los van de site. Als er iets
  niet aankomt wil je weten of het aan de winkel ligt of aan de mailserver.
- Bouw een voorbeeldweergave van elke mail in de browser, zodat je de opmaak
  kunt bekijken zonder te versturen.

---

## Marketing is iets anders

Een bevestiging, een verzendbericht en een beoordelingsuitnodiging vallen onder
de klantrelatie: die mogen zonder toestemming vooraf. **Een aanbiedingsmail
niet.**

Komt er ooit een nieuwsbrief, dan geldt: aparte toestemming, vastgelegd met
datum en herkomst, een uitschrijflink in elke mail, en bij voorkeur een andere
verzendende mailbox — een nieuwsbrief die als spam wordt gemarkeerd mag de
bevestigingsmail niet meeslepen.
