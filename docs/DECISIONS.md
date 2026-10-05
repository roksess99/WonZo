# Beslissingen — WonZo

Het geheugen van het project. Elke keuze die niet uit de code af te leiden is,
staat hier met status, afhankelijkheden, datum en reden. **Zolang een
beslissing niet `DECIDED` is: niet gokken, vragen** — ook als het antwoord
voor de hand lijkt te liggen. Werk dat ervan afhangt blijft liggen.

## Statussen

| Status | Betekenis | Verplicht |
|---|---|---|
| `OPEN` | Nog niet beantwoord; er ontbreekt informatie (meting, offerte, advies) | — |
| `BLOCKED` | Wacht op een andere beslissing | `Depends on` met minstens één niet-`DECIDED` beslissing |
| `READY` | Afhankelijkheden `DECIDED`, informatie compleet; alleen het antwoord van de eigenaar ontbreekt | alle `Depends on` `DECIDED` |
| `DECIDED` | Beantwoord | `Decided` (datum), reden, en het verworpen alternatief |
| `SUPERSEDED` | Vervangen | `Superseded by` |

Claude zet een beslissing nooit zelf op `DECIDED`. Claude mag `BLOCKED` →
`READY` voorstellen als de afhankelijkheden beslist zijn.
`node scripts/validate-template.mjs` controleert nummers, statussen en
afhankelijkheden.

**Vorm van een beantwoorde beslissing** (voorbeeld):

```text
## D-99 · Korte titel

- **Status:** DECIDED
- **Depends on:** D-01
- **Decided:** 2026-01-31

Wat er besloten is, in één alinea.

**Waarom dit en niet het alternatief.** Het alternatief benoemen is het
belangrijkste deel: dat is wat je later opnieuw zou overwegen.

GEMETEN 2026-01-31 — omgeving en waarneming waarop het rust.

**Wat er niet in zit:** wat bewust is overgeslagen.
```

## Volgorde

```text
D-00 framework/hosting ──┬─► D-05 betaaldienst ──► D-09 retouren
                         ├─► D-06 database ──► D-07 beheer, D-19 backup/herstel
                         ├─► D-17 CI/CD
                         └─► D-18 observability
D-01 leverancier ────────┬─► D-02 assortiment, D-04 inkoop, D-13 verzending
                         ├─► D-16 kostprijs ──► D-03 prijsopbouw ──► D-08 kortingen
                         └─► D-22 voorraad en snapshot
D-01 + D-05 + D-18 ──────► D-10 privacy en cookies
D-01 + D-06 ─────────────► D-31 catalogus synchroniseren

Zonder afhankelijkheid (open): D-11, D-12, D-15, D-20, D-21, D-23, D-24, D-29, D-33, D-34
```

---

## D-00 · Framework en hosting

- **Status:** DECIDED
- **Depends on:** —
- **Decided:** 2026-10-05

WonZo wordt gebouwd met **Next.js** (routes in `src/app/`), **TypeScript**,
**pnpm** en **Tailwind CSS**, en draait bij **Hostinger** (pakket "Unlimited"
met Node.js) op `wonzo.nl`. Kleuren, maten en lettertypen komen als
CSS-variabelen uit `docs/BRAND.md`; Tailwind gebruikt die, geen UI-kit.

**Waarom dit en niet het alternatief.** De hele set ging al uit van een
serverrenderend React-framework met pnpm: de mappen in `CLAUDE.md`, de paden
in `.claude/rules/`, de Tailwind-klassen in `frontend.md` en de namen in
`.env.example`. Serverrendering is voor een webshop geen luxe (vindbaarheid,
een prijs zonder JavaScript-ronde), en één taal voor browser en server laat
beide dezelfde geldfunctie gebruiken. Verworpen: een ander framework of
gewone CSS — dat had regels, paden en variabelen laten herschrijven zonder dat
er een eis voor was. Gekozen door de eigenaar, op advies.

**Wat hiermee vaststaat** (eerder `AANNAME`): pnpm en de commando's in
`CLAUDE.md`; `src/app/` als routemap; de paden `src/middleware.ts` en
`src/proxy.ts` in `beveiliging.md` (de naam hangt af van de Next.js-versie);
Tailwind in `frontend.md`; `NEXT_PUBLIC_` in `.env.example`; `.next/` in
`.gitignore`; `pnpm dev` in `.claude/launch.json`. Niet: de donkere modus
(D-33).

**Opgave van de eigenaar (2026-10-05):** Next.js draait op dit
Hostinger-pakket; dat weet de eigenaar zeker. Dat is een opgave, geen eigen
meting van dit project. **Bij de eerste uitrol nagaan** (`docs/HOSTING.md`
§ 9), omdat het in een vorig project daar misging: bouwt Next.js op Hostinger (processen en geheugen); werken de
dependencies zonder native compilatie; overleeft `node_modules` de
uitrolmethode (pnpm-symlinks); bouwen op de server of een gebouwd artefact
uploaden; is een webhook-URL van buiten bereikbaar (D-05). Valt die meting
tegen, dan wordt deze beslissing herzien.

**Wat er niet in zit:** de versies van Next.js en Tailwind (bij installatie,
na vragen — `ask`-regel), de database (D-06), het CI-platform (D-17).

---

## D-01 · Welke leverancier, en wat kan die API echt?

- **Status:** OPEN
- **Depends on:** —

Niet de verkooppraat maar het gemeten gedrag: `docs/api/LEVERANCIER.md`
helemaal invullen vóór er adaptercode komt. Lessen uit een vorig project
(`EERDER WAARGENOMEN`): een catalogus is niet altijd te bladeren; meerdere
verkopers per artikel maken "de prijs" een keuze; artikelnamen zijn niet te
vertalen.

**Gegeven door de eigenaar (2026-10-04):** leverancier BigBuy, met de
OpenAPI-documentatie (`docs/api/LEVERANCIER.md`). Wat die documentatie al
zegt en het ontwerp raakt (`GEDOCUMENTEERD`, niet gemeten): rate limits per
endpoint van 10 per uur voor bulklijsten en 1 per 5 s per artikel — de
catalogus moet dus als eigen kopie worden gesynchroniseerd; geen
zoek-endpoint; voorraad per magazijn met levertijd; een eigen
`internalReference` die na een timeout terug te zoeken is; geen webhooks.
Nog niet `DECIDED`: het meetformulier is niet ingevuld.

**Te beantwoorden:** welke API; welk token per onderdeel; rate limit; dekking
van het assortiment; bestellen via de API; idempotentie of eigen referentie
bij bestellen.

---

## D-02 · Wat verkopen we wel en niet?

- **Status:** BLOCKED
- **Depends on:** D-01

Een harde grens als **allowlist in code**, niet als filter in de navigatie:
ook een directe URL naar een artikel buiten het assortiment levert niets op.

**Te beantwoorden:** welke productgroepen, welke bewust niet, en wat er gebeurt
met een groep die leeg blijft.

---

## D-03 · Van inkoopprijs naar verkoopprijs

- **Status:** BLOCKED
- **Depends on:** D-01, D-16

De beslissing waar het meeste geld in zit. Inkoop is meestal excl. btw en
advies meestal incl. (`EERDER WAARGENOMEN`: weken 21 % te hoge prijzen) —
controleer met een schermafdruk van het platform. Opslag per groep werkt beter
dan één percentage; de sleutel van de opslag moet overal gelijk zijn.

**Te beantwoorden:** vaste opslag of per groep; waar de regel aan hangt; wat er
gebeurt zonder adviesprijs; minimummarge.

---

## D-04 · Wie koopt er in: een mens of de code?

- **Status:** BLOCKED
- **Depends on:** D-01

Automatisch doorbestellen is het grootste risico in het systeem. Eerder bleef
het bewust handwerk zodat annuleringen binnen minuten te honoreren waren; voor
een beginnende winkel de aanbevolen start. Automatiseren kan pas met een aparte
sleutel, een idempotente bestel-call en de `UNKNOWN`-afhandeling uit
`docs/STATE_MACHINES.md`. (Dat was het advies uit de template; de eigenaar
koos anders, zie hieronder. Een aparte bestelsleutel kent BigBuy niet.)

**Antwoord van de eigenaar (2026-10-05): automatisch.** Niemand koopt met de
hand in. Een bestelling van een klant wordt direct bij BigBuy geplaatst; het
tegoed (`moneybox`) of PayPal bij BigBuy moet genoeg geld bevatten, anders
mislukt de bestelling bij BigBuy. Status blijft `BLOCKED` tot D-01 `DECIDED`
is (de validator dwingt die volgorde af); de keuze zelf staat vast.

Wat er nog beantwoord moet worden binnen die keuze:

- **Wanneer "direct"**: na `PAID` (betaling bevestigd door de betaaldienst),
  nooit eerder — anders koopt de winkel in voor een klant die niet betaald
  heeft. Is er een korte wachttijd voor een hold-controle (`AMOUNT_MISMATCH`,
  `FRAUD_REVIEW`)?
- **Te weinig tegoed of BigBuy weigert, terwijl de klant betaald heeft**:
  opnieuw proberen na opwaarderen (met dezelfde `internalReference`), of
  terugbetalen? Wie krijgt de melding?
- **PayPal als betaalmiddel bij BigBuy**: of een bestelling met `paypal`
  zonder handeling van een mens wordt afgerekend, is een `AANNAME` — meten in
  de sandbox. `moneybox` lijkt de enige volledig automatische route.
- **Annuleren door de klant** nadat er besteld is: de documentatie kent geen
  annuleer-endpoint (`GEDOCUMENTEERD`) — wat zeggen we de klant?
- **Prijsverschil**: wijkt het bedrag van BigBuy (`/order/check`) af van de
  bevroren inkoopprijs, wordt er dan toch besteld, en tot welk verschil?

---

## D-05 · Betaaldienst

- **Status:** OPEN
- **Depends on:** D-00

**Eis (eigenaar, 2026-10-05): iDEAL** moet erbij — 58 % van de online
betalingen in Nederland (`docs/ONDERZOEK.md`), en het bekende logo is zelf
een vertrouwenssignaal. Achteraf betalen is een aparte keuze (D-35).

**Te beantwoorden:** welke dienst en methodes; webhook met handtekening of
alleen "opvragen"; ondersteunt hij idempotentiesleutels; mapping van zijn
statussen naar `docs/STATE_MACHINES.md` § Payment; geldigheid van een
betaalpoging; zijn rol onder de AVG; toegankelijkheid van zijn betaalpagina;
zijn bestellingen van € 0 toegestaan. Architectuur: `docs/PAYMENTS.md`.

---

## D-06 · Database

- **Status:** OPEN
- **Depends on:** D-00

Dat er een database met transacties komt staat vast (D-25). Hier gaat het om
**welke**, en hoe migraties lopen.

`AANNAME` in de set die hiermee bevestigd of aangepast wordt: een database op
een server (`DATABASE_HOST/PORT/USER` in `.env.example`), rijvergrendeling
met `SELECT … FOR UPDATE` en `IF NOT EXISTS` in migraties
(`.claude/rules/database.md`, `docs/HOSTING.md`).

**Te beantwoorden:** welk systeem en welke versie; wat de hosting toestaat
(gemeten op een wegwerptabel); wie migraties draait in productie (pipeline of
mens); hoe point-in-time-herstel werkt.

---

## D-07 · Beheerpaneel, inloggen en rechten

- **Status:** BLOCKED
- **Depends on:** D-06

Uitgangspunten staan in `.claude/rules/beveiliging.md` (MFA verplicht, sessies
in de database, rechten per onderdeel, audit).

**Te beantwoorden:** pad van het paneel; welke rechten bestaan; sessieduur
(inactief en absoluut); wie mag terugbetalen en tot welk bedrag zonder tweede
persoon.

---

## D-08 · Kortingen en acties

- **Status:** BLOCKED
- **Depends on:** D-03

Regels en rekenvolgorde: `docs/PRIJZEN.md`. De "van"-prijs vraagt een
prijsgeschiedenis die loopt vóór een actie begint — begin vroeg met meten.

**Te beantwoorden:** niveau van acties (artikel, groep, soort); komen er
kortingscodes; "één keer per klant" op welke sleutel.

---

## D-09 · Retourneren

- **Status:** BLOCKED
- **Depends on:** D-05

Wettelijke kaders en stroom: `docs/RETOUREN.md`.

**Te beantwoorden:** hoe een klant aanmeldt; wie de retourzending betaalt bij
een fout van de winkel; terugbetalen na ontvangst of na verzendbewijs;
waardevermindering ja/nee en hoe vastgesteld.

---

## D-10 · Privacy en cookies

- **Status:** BLOCKED
- **Depends on:** D-01, D-05, D-18

Werkwijze en dataflows: `docs/PRIVACY.md`.

**Te beantwoorden:** bewaartermijnen per gegeven; komt er analytics en zo ja
welke soort; is er een toestemmingsbanner nodig; wie bevestigt de
privacyverklaring juridisch.

---

## D-11 · Marketingmail

- **Status:** OPEN
- **Depends on:** —

Transactiemail mag zonder toestemming vooraf, een aanbiedingsmail niet
(`WETTELIJK`, te bevestigen). Adressen verzamelen "voor later" kan niet.

**Te beantwoorden:** komt er een nieuwsbrief; hoe wordt toestemming
vastgelegd; aparte verzendende mailbox.

---

## D-12 · Beoordelingen

- **Status:** OPEN
- **Depends on:** —

Selectief publiceren is een oneerlijke handelspraktijk (`WETTELIJK`, te
bevestigen). Uitnodiging per bestelling met een token; verbergen alleen met
reden; geen sterrengemiddelde in de markering zonder echte beoordelingen.

**Te beantwoorden:** komen ze er; eigen systeem of een dienst.

---

## D-13 · Verzending

- **Status:** BLOCKED
- **Depends on:** D-01

**Te beantwoorden:** vervoerder en tarieven; drempel voor gratis verzending;
bestelling uit meerdere bronnen (twee pakketten, één of twee keer
verzendkosten); na hoeveel dagen geldt een zending als afgeleverd zonder
melding; **hoe de levertijd getoond wordt** — als bereik uit de gegevens van
de leverancier, met het land van verzending, op kaart, productpagina,
winkelwagen, afrekenen en bevestiging (`WETTELIJK`: ACM, zie
`docs/ONDERZOEK.md`). Ter vergelijking bij de drempel: gemiddeld rond € 25 in
Nederland, vidaXL € 70 (`GEDOCUMENTEERD`, Sendcloud en vidaXL).

---

## D-14 · Valuta en markten

- **Status:** DECIDED
- **Depends on:** —
- **Decided:** 2026-10-05

Eén valuta: **euro (EUR)**. Eén markt: **Nederland**, met de Nederlandse
btw-tarieven en regels. Geen prijzen per markt. De Engelstalige pagina's
(D-32) veranderen de markt niet: dezelfde prijzen, in euro, in Nederlandse
notatie.

Het geldmodel draagt de valuta toch op elk bedrag (`.claude/rules/geld.md`):
dat kost niets en houdt een tweede valuta later mogelijk zonder datamigratie.

**Waarom dit en niet het alternatief.** Opgave van de eigenaar: Nederlandse
markt, valuta euro. Verworpen: verkopen in meerdere landen of valuta — dat
brengt btw-tarieven en regels per land mee waar nu geen vraag naar is.

---

## D-15 · Btw-berekening, afronding en kortingsverdeling

- **Status:** OPEN
- **Depends on:** —

Laten bevestigen door de boekhouder; daarna één functie overal.

**Te beantwoorden:** btw per regel of per tarief over het totaal; afronding
(half-up, bankers); verdeling van een orderkorting (proportioneel, methode voor
de rest); btw op verzendkosten bij gemengde tarieven.

---

## D-16 · Kostprijs (landedCost) en ondergrens

- **Status:** BLOCKED
- **Depends on:** D-01

Tot deze beslissing is `landedCost = supplierCost` een benoemde aanname.

**Te beantwoorden:** wat telt mee in de kostprijs (inkomende verzending,
betaalkosten per transactie, toeslagen, retourrisico); per artikel of als
opslag; wat de ondergrens voor acties is.

---

## D-17 · CI/CD, testtools en omgevingen

- **Status:** OPEN
- **Depends on:** D-00

Architectuur: `docs/CI_CD.md`; teststrategie: `docs/TESTEN.md`.

**Te beantwoorden:** CI-platform; test- en E2E-runner; komt er een staging;
hoe wordt productie-uitrol goedgekeurd.

---

## D-18 · Observability-tooling

- **Status:** OPEN
- **Depends on:** D-00

Eisen: `docs/OBSERVABILITY.md`.

**Te beantwoorden:** waar logs heen gaan en hoe lang; error tracking; uptime-
monitor; wie alerts ontvangt.

---

## D-19 · Backup- en hersteldoelen

- **Status:** BLOCKED
- **Depends on:** D-06

Eisen en plaatshouders: `docs/DISASTER_RECOVERY.md`.

**Te beantwoorden:** RPO, RTO, backupfrequentie, retentie, offsite-locatie,
interval van de restoretest, incident-eigenaar.

---

## D-20 · Toegankelijkheid: juridische toepasselijkheid

- **Status:** OPEN
- **Depends on:** —

Het technische doel staat vast (D-28). Deze vraag gaat over de wet:
`docs/ACCESSIBILITY.md`.

**Te beantwoorden:** valt de winkel onder de European Accessibility Act of een
vrijstelling; is een toegankelijkheidsverklaring nodig.

---

## D-21 · Factuurbeleid

- **Status:** OPEN
- **Depends on:** —

Laten bevestigen door de boekhouder (`docs/FACTUUR.md`).

**Te beantwoorden:** altijd een factuur, ook voor consumenten; nummerformaat;
aparte reeks voor creditnota's; PDF opslaan of regenereren; kan de gekozen
PDF-bibliotheek getagde, deterministische PDF's maken (meten).

---

## D-22 · Voorraad, reservering en geldigheid van de snapshot

- **Status:** BLOCKED
- **Depends on:** D-01

Bij dropship ligt de voorraad bij de leverancier en is lokaal reserveren
beperkt zinvol.

**Te beantwoorden:** wordt voorraad gereserveerd bij het afrekenen; mag er
besteld worden bij onbekende voorraad; hoe lang is een bevroren snapshot
betaalbaar.

---

## D-23 · Klantaccounts

- **Status:** OPEN
- **Depends on:** —

Afrekenen zonder account is het uitgangspunt (`docs/SCHERMEN.md`). Een account
voegt wachtwoorden, sessies en herstel voor klanten toe.

**Te beantwoorden:** komen er klantaccounts; zo ja, met welke authenticatie.

---

## D-24 · Bewaartermijnen

- **Status:** OPEN
- **Depends on:** —

**Te beantwoorden:** prijsgeschiedenis (minimaal de referentieperiode plus
marge, of langer als bewijs); auditlog; provider-events; applicatielogs; IP-
adressen in logs.

---

## D-25 · Bedrijfsstaat alleen in een database met transacties

- **Status:** DECIDED
- **Depends on:** —
- **Decided:** 2026-10-01

Bestellingen, betalingen, terugbetalingen, factuurnummers, sessies,
reserveringen, idempotentiesleutels en audit staan in een database met
transacties — nooit op het filesystem (`.claude/rules/database.md`).

**Waarom dit en niet het alternatief.** De eerdere tekst stelde "begin met
JSON-bestanden, stap over bij de eerste teller". Verworpen op instructie van de
eigenaar: een deploy die naar een nieuwe map kopieert, een tweede proces of
een crash halverwege een schrijfactie kan bedrijfsstaat stil breken, en de
overstap later is een migratie van live data. De database zelf kiezen blijft
D-06.

---

## D-26 · Geautomatiseerd testen is de norm

- **Status:** DECIDED
- **Depends on:** —
- **Decided:** 2026-10-01

Bedrijfskritieke logica heeft unit-, integratie-, security- en E2E-tests
(`docs/TESTEN.md`). Handmatige controle vult aan.

**Waarom dit en niet het alternatief.** De eerdere tekst koos "geen
testrunner, controlescripts en echte doorlopen". Verworpen op instructie van de
eigenaar: geld, state machines, idempotentie en autorisatie zijn precies de
fouten die je met kijken niet vindt. De controlescripts blijven, als
aanvulling. Welke tools: D-17.

---

## D-27 · Volgorde bij geldbewegingen: intent eerst

- **Status:** DECIDED
- **Depends on:** —
- **Decided:** 2026-10-01

Een order (`PENDING_PAYMENT`) of terugbetaling (`REQUESTED`) wordt met een
idempotentiesleutel vastgelegd vóór de call naar de provider; de uitkomst
wordt pas geschreven na bevestiging van de provider; reconciliatie herstelt
afwijkingen (`docs/PAYMENTS.md`).

**Waarom dit en niet het alternatief.** De eerdere regel "betaaldienst eerst,
database daarna" voorkwam terecht een terugbetaling die als geslaagd in de
boeken staat zonder geld, maar liet bij een crash ná de provider-call geen
spoor achter, en paste niet op betalingen (een betaling zonder bestaande order).
Intent-first behoudt de bedoeling — nooit "geslaagd" vóór de provider het
bevestigt — en voegt het spoor toe. Opgelost als logisch gevolg van de
bestaande regels en de instructie van de eigenaar.

---

## D-28 · Technisch toegankelijkheidsdoel: WCAG 2.2 AA

- **Status:** DECIDED
- **Depends on:** —
- **Decided:** 2026-10-01

WCAG 2.2 niveau AA is het technische doel voor winkel, beheer, mail en PDF
(`docs/ACCESSIBILITY.md`), los van de juridische vraag (D-20).

**Waarom dit en niet het alternatief.** Een lager doel (A, of alleen "best
effort") laat juist de checkout-problemen staan die klanten kosten; een hoger
(AAA) is voor een winkel niet haalbaar over de hele linie. Instructie van de
eigenaar.

---

## D-29 · Maildienst voor transactiemail

- **Status:** OPEN
- **Depends on:** —

Er was geen beslissing over de dienst die bevestigingen, verzendberichten en
beheerdersmeldingen verstuurt; `.env.example` ging stil uit van SMTP. Eisen:
`docs/MAIL.md` (SPF/DKIM/DMARC, afzender op het eigen domein, outbox).

**Te beantwoorden:** welke dienst; SMTP of API; waar de dienst de gegevens
verwerkt (`<<MAIL_LOCATIE>>`, `docs/PRIVACY.md`) en zijn rol onder de AVG;
geeft hij een message-id terug (`docs/IDEMPOTENCY.md` § Mail); aparte afzender
voor marketing als D-11 die toestaat.

---

## D-30 · Correcties in de set bij de start van WonZo

- **Status:** DECIDED
- **Depends on:** —
- **Decided:** 2026-10-04

Bij de inventaris van de set kwamen tegenstrijdigheden en gaten naar boven. De
eigenaar heeft de voorgestelde oplossingen goedgekeurd:

1. **Mislukte laatste betaling → order `PAYMENT_FAILED`.** `docs/PAYMENTS.md`
   § Reconciliatie en `docs/CHECKLIST.md` aangepast aan
   `docs/STATE_MACHINES.md`, de hogere autoriteit.
2. **Payment `CREATED → PENDING/PAID`** via provider of reconciliatie
   toegevoegd aan `docs/STATE_MACHINES.md`, zodat een betaling waarvan het
   `providerPaymentId` nooit is opgeslagen toch verwerkt kan worden.
3. **Retour na mislukte refund** gaat terug naar de status waar hij vandaan
   kwam (`RECEIVED` of `REQUESTED`), niet altijd naar `RECEIVED`.
4. **Technisch toegankelijkheidsdoel** verwijst in `docs/ACCESSIBILITY.md`
   naar D-28; D-20 gaat alleen over de wet.
5. **Mock en fixtures** staan als één set onder `src/lib/catalog/fixtures/`,
   niet onder `tests/`: de mock draait ook in productie zonder token.
6. **Beleidswaarden in `.env.example`** leeggemaakt (marge, adviesprijs,
   SMTP-poort) tot D-03, D-16 en D-29 beslist zijn.
7. **Maildienst** als eigen beslissing toegevoegd (D-29); de beslisgrafiek
   aangevuld; de framework- en databaseaannames bij D-00 en D-06 opgesomd.

**Waarom dit en niet het alternatief.** Het alternatief was elk conflict laten
staan tot het in code zou opduiken. Dan kiest de eerste implementatie
willekeurig een kant, en dat is precies wat het conflictprotocol
(`docs/AUTHORITY.md`) moet voorkomen. Bij 1 won de hogere autoriteit; bij 2, 3
en 5 was de oplossing een logisch gevolg van de bestaande architectuur.

**Wat er niet in zit:** geen keuze voor framework, database of maildienst —
die blijven D-00, D-06 en D-29.

Bevestigd door de eigenaar op 2026-10-05.

---

## D-31 · Catalogus synchroniseren

- **Status:** BLOCKED
- **Depends on:** D-01, D-06

BigBuy staat het niet toe de catalogus per paginaweergave op te vragen:
productlijsten, prijzen en voorraad 10 keer per uur, één artikel 1 keer per
5 seconden, voor de hele winkel (`GEDOCUMENTEERD`,
`docs/api/LEVERANCIER.md` § Rate limits). Er is ook geen zoek-endpoint. De
winkel werkt daarom op een eigen, periodiek bijgewerkte kopie van de
catalogus.

Dit raakt, en wordt na deze beslissing daar verwerkt:
`.claude/rules/catalogus.md` § Caching — prijs en voorraad in de checkout
"niet gecachet" —, `docs/SUPPLIER_RESILIENCE.md` (stale-beleid, retries in de
checkout), `CLAUDE.md` § Bouwvolgorde — de echte catalogus in fase 3, de
database pas in fase 4 — en D-22 (geldigheid van de snapshot).

**Te beantwoorden:** welke lijst hoe vaak binnenhalen, binnen de limieten;
waar de kopie staat (database, of een reproduceerbaar cachebestand — dat staat
`.claude/rules/database.md` toe); hoe de checkout prijs en voorraad vers
controleert (`POST /rest/order/check`, 1 per seconde voor de hele bestelling,
of per artikel, 1 per 5 seconden); wat er gebeurt als die controle de limiet
raakt; hoe oud een getoonde prijs of voorraad mag zijn; zoeken en filteren op
de eigen kopie.

---

## D-32 · Talen van de winkel

- **Status:** DECIDED
- **Depends on:** —
- **Decided:** 2026-10-05

De winkel is er in het **Nederlands** en het **Engels**.

- Alle klantteksten staan in `messages/` per taal, met dezelfde sleutels; een
  ontbrekende sleutel laat de bouw falen (`.claude/rules/frontend.md`).
- Productnamen en omschrijvingen komen per taal van de leverancier
  (`isoCode`). Dat `nl` en `en` beide bestaan is `GEMETEN` (2026-10-05,
  `docs/api/LEVERANCIER.md` § 9); hoe volledig de vertalingen zijn, nog niet.
- Bedragen in Nederlandse notatie, ook op de Engelse pagina's (D-14).

**Waarom dit en niet het alternatief.** Keuze van de eigenaar. Verworpen:
alleen Nederlands — de eigenaar wil ook Engelstalige klanten in Nederland
bedienen.

**Nederlands is de standaardtaal** (eigenaar, 2026-10-05): wie zonder
taalkeuze binnenkomt, krijgt Nederlands.

**Nog te beantwoorden binnen deze keuze:** hoe de taal in de URL staat; in
welke taal mail, factuur en algemene voorwaarden gaan (de taal van de klant,
of altijd Nederlands — juridische teksten laten bevestigen).

---

## D-33 · Donkere modus

- **Status:** OPEN
- **Depends on:** —

De eerste versie heeft **geen donkere modus** (eigenaar, 2026-10-05); of hij
er later komt, wordt later beslist. De huisstijl kent alleen een licht thema;
het brandbook noemt een donker thema voor het beheer "nog te doen".

Componenten gebruiken toch alleen de semantische tokens uit `docs/BRAND.md`,
zodat een donkere modus later op één plek kan worden toegevoegd.

**Te beantwoorden:** komt er een donkere modus, en voor welk deel (winkel,
beheer); wie levert de kleuren (met een eigen contrasttabel); volgt hij de
systeeminstelling of een schakelaar.

---

## D-34 · Wettelijke productinformatie voor elektronica

- **Status:** OPEN
- **Depends on:** —

Vier punten uit `docs/ONDERZOEK.md` die bij elektronica en huishoudelijke
apparaten horen. Alle `WETTELIJK`, te bevestigen door een adviseur.

1. **Energielabel** (Verordening (EU) 2017/1369): label en productkaart bij de
   prijs, klasse ook in lijsten. Verwachting van de eigenaar: BigBuy levert
   dit via de API (`AANNAME` — meten, `docs/api/LEVERANCIER.md` § 8).
2. **Productveiligheid (GPSR,** Verordening (EU) 2023/988 art. 19): fabrikant,
   EU-verantwoordelijke, identificatie en waarschuwingen in het Nederlands bij
   elk product. Verwachting van de eigenaar: BigBuy levert dit via
   `productcompliance` (`AANNAME` — meten).
3. **Oude apparaten innemen (oud voor nieuw):** standpunt van de eigenaar
   (2026-10-05): "we zijn een dropshipping-webshop, dus dit hoeft niet". Dat
   is een `AANNAME`: de gevonden bronnen leggen de plicht bij de verkoper aan
   de consument en noemen webwinkels uitdrukkelijk; een uitzondering voor
   dropshipping is niet gevonden. **Laten bevestigen**; tot dan wordt er
   niets voor gebouwd, op instructie van de eigenaar.
4. **Producentenverantwoordelijkheid (Stichting OPEN):** wie elektrische
   apparaten als eerste op de Nederlandse markt brengt, registreert zich en
   betaalt een afvalbeheerbijdrage. Bij inkoop in Spanje vermoedelijk WonZo;
   de bijdrage hoort dan in de kostprijs (D-16).

**Te beantwoorden:** bevestiging van 3 en 4 door een adviseur; wat BigBuy
werkelijk levert voor 1 en 2 (meting); wat er gebeurt met een artikel waarvan
de verplichte informatie ontbreekt (niet tonen, of niet koopbaar).

---

## D-35 · Inhoud van de eerste versie

- **Status:** DECIDED
- **Depends on:** —
- **Decided:** 2026-10-05

De eerste versie bevat wat het onderzoek (`docs/ONDERZOEK.md` § 3) onder "Eerste versie"
noemt: zoeken op de eigen kopie, hoofdgroepen als beeldtegels, filters met
meervoudige keuze en zichtbare gekozen filters, sorteren op prijs,
populariteit en nieuwste, een productpagina met koopblok (prijs, levertijd als
bereik met land van verzending, verzendkosten, voorraad), winkelwagen met
"nog € X tot gratis verzending", afrekenen zonder account, bevestiging,
statuspagina, retour aanmelden, bedrijfsgegevens en een uitleg "zo werkt
WonZo", in het Nederlands en Engels. De ontwerpregels uit § 4 gelden voor elk
scherm.

**Later**, bewust niet in de eerste versie: klantaccount (D-23),
beoordelingen (D-12), verlanglijst, vergelijken, achteraf betalen, nieuwsbrief
(D-11), keurmerk. **Bewust niet:** nep-urgentie, pop-ups bij binnenkomst,
automatisch draaiende carrousels, een chatbot die zich als mens voordoet.

**Waarom dit en niet het alternatief.** Akkoord van de eigenaar op het
voorstel uit het onderzoek. Verworpen: alles in één keer — accounts,
beoordelingen en vergelijken maken de eerste versie groter zonder dat iemand
er zonder kan kopen, en een leeg beoordelingssysteem wekt wantrouwen.

---

## Beslislog

| Datum | Beslissing | Wijziging |
|---|---|---|
| 2026-10-01 | D-00 – D-24 | Herschreven naar statusformaat met afhankelijkheden; D-14 – D-24 toegevoegd bij de herziening van de template |
| 2026-10-01 | D-25 – D-28 | Vastgelegd op instructie van de eigenaar (herziening template) |
| 2026-10-05 | D-05, D-13, D-34, D-35 | Voorstellen uit `docs/ONDERZOEK.md` doorgevoerd: iDEAL als eis (D-05), levertijd tonen (D-13), wettelijke productinformatie (D-34, open; standpunt eigenaar over oud voor nieuw vastgelegd), inhoud eerste versie (D-35) |
| 2026-10-05 | D-00, D-30, D-32 | D-30 bevestigd door de eigenaar; Nederlands standaardtaal (D-32); opgave eigenaar dat Next.js op Hostinger draait (D-00) |
| 2026-10-05 | D-00, D-14, D-32, D-33 | Beslist door de eigenaar: Next.js, TypeScript, pnpm, Tailwind, Hostinger (D-00); euro en Nederland (D-14); Nederlands en Engels (D-32); eerste versie zonder donkere modus (D-33, open). D-05, D-06, D-17, D-18 van BLOCKED naar OPEN: D-00 is beslist, de informatie is nog niet compleet |
| 2026-10-05 | D-04 | Documenten aangepast aan automatisch inkopen (beheer, mail, state machine, dreigingsmodel, observability, idempotentie, checklist); wat er na een mislukte inkoop gebeurt blijft open |
| 2026-10-05 | D-00, D-04, D-31 | Hostingpakket vastgelegd bij D-00; antwoord van de eigenaar op D-04 (automatisch inkopen) vastgelegd, status blijft BLOCKED tot D-01; D-31 toegevoegd |
| 2026-10-04 | D-29, D-30 | Set geplaatst in het WonZo-project; D-29 toegevoegd (OPEN); correcties goedgekeurd door de eigenaar (D-30); aannamelijsten bij D-00 en D-06 |
