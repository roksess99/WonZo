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

Zonder afhankelijkheid (open): D-11, D-12, D-15, D-20, D-21, D-23, D-24, D-29, D-33, D-34, D-37
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

GEMETEN 2026-10-06 — eerste uitrol (bouwlog, door de eigenaar gedeeld): het
pakket "Unlimited" biedt "Node.js web app" ("Stuur je code, wij hosten het");
de bouw kloont `main`, gebruikt Node 24 en pnpm 11.20.0 (uit `packageManager`)
en installeert 382 pakketten in 12 s. `pnpm run build` bleef daarna hangen op
een vraag van pnpm om `node_modules` opnieuw te installeren; opgelost met
`verifyDepsBeforeRun: false` (`pnpm-workspace.yaml`). Valkuil: de gewone
Git-functie van een bestaande website kopieert de repo naar `public_html`
zonder te bouwen — de broncode stond daardoor kort leesbaar op wonzo.nl
(geen geheimen: `.env` staat niet in Git); verwijderd door de eigenaar.
Tweede bouw: de systeembibliotheek op de bouwserver is te oud voor de
compiler van Next.js 16.3 (`GLIBC_2.29 not found`, bekend als
vercel/next.js#96960, geen herstelde versie). Next valt terug op
WebAssembly, en daarmee kan het `next.config.ts` niet laden en werkt
Turbopack niet. Oplossing: `next.config.mjs` en `next build --webpack`;
`pnpm dev` blijft Turbopack. Alternatief, niet gekozen: Next.js terugzetten
naar een versie vóór 16.3 (wijziging van een afhankelijkheid, en de fout
komt terug bij de volgende upgrade).
Derde bouw: `NEXT_PUBLIC_SITE_URL` stond op `wonzo.nl` zonder `https://`
("Invalid URL" bij het bouwen); door de eigenaar gezet op `https://wonzo.nl`.

GEMETEN 2026-10-06 — **de site draait op https://wonzo.nl** (vanaf deze
machine, met curl): alle pagina's 200 (NL en EN), 308 voor `/nl/…`,
`/en/winkelwagen` en een oude productnaam, 404 voor onbekende adressen en
uitgesloten producten; `POST /api/cart` rekent goed (2 × € 29,99 + € 99,99
+ € 63,80 groot artikel = € 223,77) en weigert een fout verzoek met 400;
canonical en taallinks op `https://wonzo.nl`; antwoorden in ongeveer 0,1 s;
broncodebestanden geven 404, `.env` 403. Bouwen en starten werkt op dit
pakket: de bouw met webpack duurt ongeveer 36 s.
**Keuze van de eigenaar (2026-10-06):** zoekmachines mogen de site ook in de
testfase opnemen — geen `noindex`, geen schakelaar. Gevolg om te kennen:
Google kan voorbeeldproducten en -prijzen tonen tot de echte catalogus er
staat (fase 3).

**Na de livegang toegevoegd** (`next.config.mjs`): beveiligingsheaders
(HSTS zonder subdomeinen, nosniff, referrer-policy, framen verboden,
cross-origin-opener, geen camera/microfoon/locatie) en geen `X-Powered-By`.
Een volledige CSP voor scripts blijft een eigen taak
(`.claude/rules/beveiliging.md` § Headers en CSP). `NEXT_PUBLIC_SITE_URL`
wordt bij het laden gecontroleerd, met een duidelijke melding
(`src/lib/seo.ts`).

Nog open: beeldoptimalisatie voor echte productfoto's (fase 3, `sharp` staat
uit); volledige CSP; databases; webhook-URL.

**Wat er niet in zit:** de versies van Next.js en Tailwind (bij installatie,
na vragen — `ask`-regel), de database (D-06), het CI-platform (D-17).

---

## D-01 · Welke leverancier, en wat kan die API echt?

- **Status:** DECIDED
- **Depends on:** —
- **Decided:** 2026-10-05

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
**Besloten (eigenaar, 2026-10-05): BigBuy.** Gemeten in sandbox en productie
(`docs/api/LEVERANCIER.md`, `GEMETEN 2026-10-05`): één sleutel voor lezen en
bestellen; 22 hoofdgroepen in het Nederlands; productlijsten per hoofdgroep,
pagina's vanaf 0, koppelen op id; ongeveer 1 % van de catalogus op voorraad
(bevestigd in het account); fabrikantgegevens voor GPSR bij de meeste
artikelen; een eigen referentie bij bestellen die terug te zoeken is (404 als
hij niet bestaat); vervoerders naar Nederland met levertijden.

**Waarom dit en niet het alternatief.** Keuze van de eigenaar; de meting
bevestigt dat bladeren, voorraad, Nederlandse namen en bestellen via de API
mogelijk zijn. Een andere leverancier is niet onderzocht — dat is het
verworpen alternatief, en het blijft de uitweg als het lage voorraadpercentage
(vraag 6 in `docs/api/VRAGEN.md`) de winkel te klein maakt.

**Nog open, niet blokkerend:** of de adviesprijs incl. of excl. btw is — de
inkoopprijs is excl. btw (`GEMETEN 2026-10-05`, schermafdruk V0710266), de
adviesprijs vermoedelijk ook, te bevestigen door BigBuy
(`docs/api/LEVERANCIER.md`); energielabel bij een artikel dat er een heeft; `order/check` en
bestellen testen (de sandbox heeft geen catalogus); voorraad per variant;
stabiliteit van de taxonomie-id's over de tijd.

---

## D-02 · Wat verkopen we wel en niet?

- **Status:** DECIDED
- **Depends on:** D-01
- **Decided:** 2026-10-05

Een harde grens als **allowlist in code**, niet als filter in de navigatie:
ook een directe URL naar een artikel buiten het assortiment levert niets op.

GEMETEN 2026-10-05 (productie, `docs/api/LEVERANCIER.md` § 2, § 7, § 10):
BigBuy heeft 22 hoofdgroepen, waaronder één voor volwassenen; artikelen kunnen
gereviseerd zijn (`condition`, bijv. `REFURBISHED_B`); in de steekproef had 2
van de 50 artikelen voorraad.

**Te beantwoorden:** welke productgroepen, welke bewust niet, en wat er gebeurt
met een groep die leeg blijft; **gereviseerde artikelen** uitsluiten of
duidelijk als gereviseerd tonen; artikelen **zonder voorraad** tonen of
verbergen.

**Besloten (eigenaar, 2026-10-05):** een artikel komt in de winkel als het
aan **alle** regels voldoet, afgedwongen in de code:

1. Het valt in een toegestane subcategorie:
   - Huis en koken: opslag en organisatie, meubilair, huisdecoratie (ook
     kaarsen en kandelaars), servies, keukengerei en bargerei;
   - Tuin: tuinmeubelen, parasols en zonneschermen, bewatering,
     houtskoolbarbecues en accessoires;
   - Sport en outdoor: kampeermeubelen en slaapuitrusting, thuis sporten;
   - Dierproducten: halsbanden en tuigen, manden en dekens, kleding.

   Gezocht op naam in de taxonomieboom, niet op vast id, tot de stabiliteit
   van de id's gemeten is.
2. De douanecode valt in **basis** of **licht** (`docs/ONDERZOEK.md` § 6).
3. Niet in de uitsluitingslijst van D-36, en geen elektrisch kenmerk of
   batterij in de naam; twijfelgevallen gaan naar een lijst voor de eigenaar.
4. Conditie **nieuw** — gereviseerde artikelen komen er niet in.
5. Voorraad > 0, vers gecontroleerd bij het afrekenen (D-31, D-22).
6. GPSR-gegevens aanwezig (fabrikant met adres).
7. Een prijsondergrens of minimumbestelling — de waarde volgt uit D-03 en
   D-13.
8. Verzendkosten bekend — gevolg van D-13 (2026-10-05): ze moeten vóór het
   bestellen te zien zijn. In de meting had 1 van de 382 artikelen er geen.

Merken worden niet uitgesloten: InnovaGoods, met de diepste voorraad, hoort
erbij. Woningtextiel komt later (D-36). Niet toegestaan zijn de overige
hoofdgroepen, waaronder de groep voor volwassenen.

**Waarom dit en niet het alternatief.** Het onderzoek (`docs/ONDERZOEK.md`
§ 6–7) toont dat deze categorieën leverbaar zijn, bij "wonen" passen en alleen
de basisplichten hebben. Verworpen: de hele catalogus tonen (99 % niet
leverbaar), elektronica (registratie bij Stichting OPEN, energielabel,
inname), en gereviseerde artikelen (uitleg en garantievragen bij elke
verkoop).

**Voorstel uit het onderzoek** (`docs/ONDERZOEK.md` § 6): selectie op
toegestane subcategorie, douanecode basis of licht, geen elektrisch kenmerk,
conditie nieuw, voorraad, GPSR-gegevens aanwezig en een prijsondergrens. Met
deze regels blijven er rond de 740 artikelen over (2026-10-05), waarvan ruim
100 met diepe voorraad — vooral InnovaGoods.

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

**Afspraak tot deze beslissing** (eigenaar, 2026-10-06): de echte catalogus
wordt gebouwd en lokaal getest, maar de BigBuy-sleutel komt pas op de live
site als de prijsregel vaststaat — anders staan echte artikelen met
mogelijk 21 % te lage prijzen op een vindbare site (de adviesprijs is
vermoedelijk excl. btw, `docs/api/LEVERANCIER.md` § 6). Eerst het antwoord
van BigBuy op vraag 1 (`docs/api/VRAGEN.md`).

---

## D-04 · Wie koopt er in: een mens of de code?

- **Status:** OPEN
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

- **Status:** DECIDED
- **Depends on:** D-00
- **Decided:** 2026-10-06

Dat er een database met transacties komt staat vast (D-25). Hier gaat het om
**welke**, en hoe migraties lopen.

`AANNAME` in de set die hiermee bevestigd of aangepast wordt: een database op
een server (`DATABASE_HOST/PORT/USER` in `.env.example`), rijvergrendeling
met `SELECT … FOR UPDATE` en `IF NOT EXISTS` in migraties
(`.claude/rules/database.md`, `docs/HOSTING.md`).

**Besloten (eigenaar, 2026-10-06): MySQL bij Hostinger**, in hetzelfde
pakket als de winkel, te bekijken met phpMyAdmin. De catalogus komt erin
(D-31), en straks bestellingen, tellers en audit (fase 4).

**Waarom dit en niet het alternatief.** Alles bij één partij die al betaald
wordt, met een beheerscherm dat de eigenaar kent. Verworpen: een database bij
een andere partij (bijv. PostgreSQL als dienst) — een extra verwerker voor de
AVG, een extra rekening en een verbinding over het internet; en een bestand
op de server voor de catalogus (D-31) — de eigenaar wil de gegevens kunnen
bekijken, en fase 4 heeft de database toch nodig.

`AANNAME`: wat Hostinger "MySQL" noemt is op gedeelde hosting vaak MariaDB;
welke en welke versie wordt gemeten, met wat de hosting toestaat
(transacties, `SELECT … FOR UPDATE`, gegenereerde kolommen —
`docs/HOSTING.md` § 5) op een wegwerptabel.

GEMETEN 2026-10-06 — `wonzo_dev` bij Hostinger, via Remote MySQL vanaf de
machine van de eigenaar (`scripts/db-check.mjs`): **MariaDB 11.8.9**; InnoDB,
utf8mb4 / utf8mb4_unicode_ci; isolatie **READ-COMMITTED**; tijdzone SYSTEM =
UTC; `sql_mode` **zonder strikte modus** (IGNORE_SPACE, NO_AUTO_CREATE_USER,
NO_ENGINE_SUBSTITUTION); `wait_timeout` **20 s**; max_allowed_packet 1 GB;
gebruiker heeft alle rechten op alleen die database. Verbinding in 127 ms.
Werkt: tabel maken (ook `IF NOT EXISTS`), emoji en accenten, BIGINT exact,
unieke sleutel (ER_DUP_ENTRY), rollback, `SELECT … FOR UPDATE` (tweede
verbinding wacht en krijgt ER_LOCK_WAIT_TIMEOUT), gegenereerde kolommen
(STORED en VIRTUAL), JSON, `ON DUPLICATE KEY UPDATE`, `GET_LOCK`.

Gevolgen voor de code: elke verbinding zet zelf een **strikte `sql_mode`**
(anders knipt de database te lange tekst of te grote getallen stil af) en
tijdzone UTC; de pool sluit ongebruikte verbindingen **vóór 20 s**;
vergrendelen altijd expliciet met `FOR UPDATE` (bij READ-COMMITTED geen
gap-locks).

**Migraties in productie** (eigenaar, 2026-10-06): **automatisch bij elke
uitrol, vóór de bouw** — het bouwscript draait eerst de migraties, met een
slot (`GET_LOCK`) zodat ze nooit dubbel lopen. Mislukt een migratie, dan
stopt de uitrol en blijft de vorige versie draaien. Daarom voegt een migratie
alleen toe; iets weghalen gebeurt pas in een latere uitrol, als de code het
niet meer gebruikt (`docs/HOSTING.md` § 4). Verworpen: met de hand vanaf de
computer van de eigenaar — vergeten betekent nieuwe code tegen een oude
database, en de live database zou van buiten bereikbaar moeten zijn.

GEMETEN 2026-10-06 — eerste uitrol met database: de bouwserver bereikt de
live database `u676833780_wonzo` met `DATABASE_HOST=localhost`
(`[db-migrate] … 0 applied, 0 pending`); `https://wonzo.nl/api/health` geeft
`database: ok`. Migreren bij elke uitrol werkt dus.

Daarbij gezien (D-00): de CDN van Hostinger vervangt onze
`Content-Security-Policy`-header door zijn eigen (`upgrade-insecure-requests`);
de andere beveiligingsheaders komen wel aan. Framen blijft verboden via
`X-Frame-Options: DENY`. Een volledige CSP zal via de CDN-instellingen of een
andere weg moeten — uitzoeken als die aan de beurt is.

**Nog open binnen deze beslissing:** backups en point-in-time-herstel
(D-19).

---

## D-07 · Beheerpaneel, inloggen en rechten

- **Status:** OPEN
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

- **Status:** DECIDED
- **Depends on:** D-01
- **Decided:** 2026-10-05

**Verzendkosten voor de klant** (eigenaar, 2026-10-05):

1. **€ 5,95** voor het gewone pakket onder de grens.
2. **Gratis vanaf € 50** (het hele subtotaal incl. btw; precies € 50 is
   gratis).
3. **Grote artikelen** — een artikel dat BigBuy los meer dan **€ 15** kost om
   te verzenden — hebben **eigen verzendkosten per stuk**: het bedrag dat
   BigBuy rekent, op de productpagina vóór de knop, en nooit gratis. In de
   meting 81 van de 381 artikelen (meubels, tuinmeubels, wat sport).

Eén regel in `src/lib/pricing/shipping.ts`, gebruikt door productpagina en
winkelwagen, straks ook door checkout en bestelling. Een artikel waarvan de
verzendkosten niet bekend zijn, komt niet in de winkel: ze moeten vóór het
bestellen te zien zijn (selectieregel, `src/lib/catalog/selection.ts`).

**Waarom dit en niet het alternatief.** Gemeten (`docs/api/LEVERANCIER.md`
§ 10, `docs/ONDERZOEK.md` § 8): BigBuy rekent per pakket op gewicht —
minimaal € 8,58, vijf kleine artikelen samen € 13,81 — maar een meubel los
€ 64 tot € 273. Een grens van € 50 is daardoor betaalbaar voor kleine
artikelen, en ligt in lijn met woonwinkels (Xenos € 45, fonQ € 50). Verworpen:
één grens voor alles (verlies op elk groot artikel); altijd de echte kosten
doorberekenen (€ 8,58 of meer schrikt af, en een grens kan dan niet);
verzending in de prijs (maakt kleine artikelen duur; hoort bij D-03). Onder
de grens betaalt WonZo per klein pakket € 2,63 bij (€ 8,58 − € 5,95).

`AANNAME`: het bedrag van BigBuy wordt bij grote artikelen doorgerekend zoals
het is; of het incl. of excl. btw is, is niet gemeten (zelfde vraag als bij
de adviesprijs; `docs/api/VRAGEN.md` vraag 2). Niet gemeten: of twee grote
artikelen samen goedkoper gaan dan per stuk — per stuk is de veilige kant.

**Nog open binnen deze beslissing:** vervoerder kiezen (SEUR en TNT gemeten);
bestelling uit meerdere bronnen; na hoeveel dagen een zending als afgeleverd
geldt zonder melding; btw op verzendkosten (D-15).

**Levertijd** (`WETTELIJK`: ACM, `docs/ONDERZOEK.md`): als bereik met het land
van verzending op kaart, productpagina, winkelwagen, afrekenen en
bevestiging. In de code (`src/lib/catalog/delivery.ts`): transport 3–5
werkdagen bovenop de verwerkingstijd, en "verzonden vanuit Spanje" — beide
`AANNAME`, op één plek, te vervangen door de gekozen vervoerdersdienst en het
gemeten magazijnland.

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

**Tot deze beslissing** (eigenaar, 2026-10-05): de winkelwagen toont
"Prijzen inclusief btw" zonder apart btw-bedrag. `docs/SCHERMEN.md` vraagt
het btw-bedrag in het totaal; dat komt erbij zodra de rekenwijze vastligt.

**Te beantwoorden:** btw per regel of per tarief over het totaal; afronding
(half-up, bankers); verdeling van een orderkorting (proportioneel, methode voor
de rest); btw op verzendkosten bij gemengde tarieven.

---

## D-16 · Kostprijs (landedCost) en ondergrens

- **Status:** OPEN
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

**Besloten deel** (eigenaar, 2026-10-05): **Vitest** voor unit- en
integratietests, **Playwright** voor de browsertests (vanaf de checkout).

**Te beantwoorden:** CI-platform; komt er een staging; hoe wordt
productie-uitrol goedgekeurd.

---

## D-18 · Observability-tooling

- **Status:** OPEN
- **Depends on:** D-00

Eisen: `docs/OBSERVABILITY.md`.

**Te beantwoorden:** waar logs heen gaan en hoe lang; error tracking; uptime-
monitor; wie alerts ontvangt.

---

## D-19 · Backup- en hersteldoelen

- **Status:** OPEN
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

- **Status:** OPEN
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

- **Status:** DECIDED
- **Depends on:** D-01, D-06
- **Decided:** 2026-10-06

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

**Besloten (eigenaar, 2026-10-06):**

- **De kopie staat in de database** (D-06), niet in een bestand. Daarom komt
  de basis van fase 4 (verbinding, migraties) vóór fase 3.
- **Verversen:** de hele catalogus één keer per nacht; de voorraad elke 2 uur.
  Sneller kan niet binnen de limieten: één ronde voor de vier groepen is
  12 pagina's producten, 11 pagina's voorraad en 24 pagina's namen (NL en
  EN), bij 10 (namen 24) per uur (`GEMETEN` 2026-10-05, verkenning).
  GPSR-gegevens alleen voor nieuwe artikelen (1 per 5 s). Bij het afrekenen
  wordt de voorraad nog eens live gecontroleerd (fase 5).
- **Productfoto's** lopen via het eigen domein, verkleind per scherm (de
  beeldbewerker van Next.js met `sharp`); in de database staan alleen de
  adressen, niet de foto's zelf. De verkleinde foto's zijn een cache op de
  server, opnieuw te maken (`.claude/rules/database.md`). Alleen
  `cdnbigbuy.com` is toegestaan als bron (`.claude/rules/beveiliging.md`
  § SSRF).

**Waarom dit en niet het alternatief.** Per paginaweergave opvragen kan niet
(de limieten gelden voor de hele winkel). Foto's rechtstreeks van BigBuy laden
was eenvoudiger, maar dan praat elke bezoeker met een derde partij.

**Gebouwd (fase 3, 2026-10-06):** tabellen in `db/migrations/0001_catalog.sql`;
het verversen in stukjes (`src/lib/catalog/bigbuy/sync.ts`) via
`POST /api/cron/catalog` met `JOB_TOKEN`, lokaal via
`scripts/catalog-sync.mjs`; de limieten per uur worden in de database geteld
(geldt voor de hele winkel). Een ronde gaat in fasen: taxonomie en merken →
producten → foto's, voorraad, namen NL/EN en verzendkosten naast elkaar →
GPSR alleen voor producten die verder verkoopbaar zijn → beoordelen. De
winkel kiest de bron met `CATALOG_SOURCE` (`mock` of `database`); live blijft
`mock` tot D-03. Database en nepdata gaan door dezelfde vertaling en
selectieregel (test: dezelfde producten).

**Uitleg van een regel** (`docs/AUTHORITY.md`, gemeld aan de eigenaar):
`.claude/rules/catalogus.md` zegt dat leveranciersvelden niet in "de
database" komen. Dat geldt voor de bedrijfstabellen (bestellingen, facturen:
daar alleen `supplierRef` en `supplierOfferId`). De catalogustabellen zijn de
eigen kopie van de adapter, met neutrale kolomnamen, alleen gelezen door
`src/lib/catalog/` en opnieuw op te halen; de rest van de winkel ziet alleen
`Product`.

**Nog open binnen deze beslissing:** hoe oud een getoonde prijs of voorraad
mag zijn voordat de winkel waarschuwt; of de geplande taak op Hostinger elke
minuut mag draaien; of `sharp` op de server werkt (vraagt glibc 2.28, de
server heeft minder dan 2.29 — meten bij de eerste echte foto's); het eerste
volledige verversen tegen de echte BigBuy (door de eigenaar, lokaal).

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

**Taal in de URL** (eigenaar, 2026-10-05): Nederlands zonder voorvoegsel
(`wonzo.nl/tuin`), Engels onder `/en` (`wonzo.nl/en/garden`). Paginanamen in
de URL zijn woorden in de taal van de pagina.

**Vertalen** (eigenaar, 2026-10-05): een eigen kleine oplossing zonder extra
pakket. **Alleen de teksten van de winkel zelf** (knoppen, koppen, meldingen)
staan in `messages/`. Productnamen, omschrijvingen en eigenschappen komen per
taal van de leverancier (`isoCode` `nl` of `en`) en worden niet door WonZo
vertaald.

**Nog te beantwoorden binnen deze keuze:** in
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

## D-36 · Registraties en productregels per categorie

- **Status:** DECIDED
- **Depends on:** —
- **Decided:** 2026-10-05

Naast D-34 (elektronica) gelden er per categorie andere regels
(`docs/ONDERZOEK.md` § 7, `WETTELIJK`, te bevestigen): UPV Textiel voor
woningtextiel, UPV Matrassen, voedselcontact en het BPA-verbod voor servies
en drinkflessen, het verbod op wegwerpplastic, persoonlijke
beschermingsmiddelen (zonnebrillen, helmen), en voor de hele winkel
Verpact, de verpakkingsverordening (PPWR), de ontbossingsverordening (EUDR,
vanaf 30-12-2026 voor kleine bedrijven) en REACH artikel 33.

**Besloten door de eigenaar:**

- **Woningtextiel komt later**, niet in de eerste versie — dan is er geen
  registratie voor UPV Textiel nodig om te beginnen.
- **Niet in het assortiment:** matrassen en toppers, wegwerpplastic,
  zonnebrillen en andere persoonlijke beschermingsmiddelen, zwemhulpmiddelen
  en opblaasbaar voor water, messen, alles met een batterij, gasbarbecues,
  ongediertebestrijding en dierenvoer.

Wat blijft voor de hele winkel: Verpact-berekening bijhouden,
EUDR-administratie vanaf 30-12-2026 (hout, papier, houtskool), REACH-vragen
binnen 45 dagen beantwoorden, documenten van de leverancier kunnen opvragen.

**Waarom dit en niet het alternatief.** Zo begint WonZo zonder registratie bij
een producentenorganisatie. Verworpen: woningtextiel nu al meenemen — een
registratie, jaarlijkse rapportage en bijdrage voor een kleine groep
artikelen.

**Nog te bevestigen door een adviseur** (`docs/ONDERZOEK.md` § 7.5): de rol
van WonZo bij levering vanuit Spanje, de EUDR-plichten, en of er inmiddels een
wettelijke leeftijdsgrens voor messen is. Wijkt het advies af, dan wordt deze
beslissing herzien.

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

## D-37 · Uitzondering op `pnpm audit`: braces (alleen ontwikkeltooling)

- **Status:** OPEN
- **Depends on:** —

`pnpm audit` meldt bij de opzet van fase 1 (2026-10-05) één hoge
kwetsbaarheid: `braces` tot en met 3.0.3 (GHSA-vfj7-8cjw-p6xm, gepubliceerd
18-09-2026): een stack overflow bij diep geneste accolade-patronen.
**Er bestaat geen gerepareerde versie** (3.0.3 is de nieuwste), dus een
override kan niet. Het pakket komt alleen binnen via `eslint-config-next`
(lint-tooling, nooit in de winkel), en het lek vraagt om patronen die een
aanvaller aanlevert; hier verwerkt het alleen onze eigen configuratie.

**Voorstel:** de melding accepteren als bekende uitzondering op "`pnpm audit`
schoon" (`CLAUDE.md` § Definition of Done), zolang hij alleen via
ontwikkeltooling binnenkomt; bij elke installatie of upgrade opnieuw
controleren en de uitzondering intrekken zodra er een gerepareerde versie
is. Komt `braces` ooit in een productie-afhankelijkheid, dan vervalt de
uitzondering.

**Antwoord van de eigenaar (2026-10-05): geen uitzondering — wachten tot de
makers een gerepareerde versie uitbrengen.** ESLint blijft (verwijderen is
niet gekozen); tot die versie er is, is "`pnpm audit` schoon" voor deze ene
melding niet gehaald, en dat wordt bij elke oplevering zo gemeld. Bij elke
installatie of upgrade controleren of er een versie boven 3.0.3 is; zo ja:
bijwerken, `pnpm audit` opnieuw, en deze beslissing sluiten.

**Te beantwoorden:** niets meer van de eigenaar; de beslissing sluit zodra de
reparatie er is.

---

## Beslislog

| Datum | Beslissing | Wijziging |
|---|---|---|
| 2026-10-01 | D-00 – D-24 | Herschreven naar statusformaat met afhankelijkheden; D-14 – D-24 toegevoegd bij de herziening van de template |
| 2026-10-01 | D-25 – D-28 | Vastgelegd op instructie van de eigenaar (herziening template) |
| 2026-10-06 | D-03, D-06, D-07, D-19, D-31 | Beslist door de eigenaar: MySQL bij Hostinger (D-06); catalogus in de database, nachtelijk verversen en voorraad elke 2 uur, foto's via het eigen domein (D-31); sleutel pas live na de prijsregel (D-03). D-07 en D-19 van BLOCKED naar OPEN |
| 2026-10-05 | D-13 | Beslist door de eigenaar: € 5,95, gratis vanaf € 50, grote artikelen (boven € 15 eigen verzendkosten) per stuk en nooit gratis; artikelen zonder bekende verzendkosten niet in de winkel |
| 2026-10-05 | D-13, D-15 | Fase 2 (winkelwagen): verzendkosten "worden nog vastgesteld" tot D-13; "Prijzen inclusief btw" zonder btw-bedrag tot D-15 (eigenaar). Onderzoek drempel gratis verzending (`docs/ONDERZOEK.md` § 8). Knop "In winkelwagen" alleen op de productpagina; adressen `/winkelwagen` en `/en/cart` (eigenaar) |
| 2026-10-05 | D-01 | Inkoopprijs excl. btw `GEMETEN` (schermafdruk V0710266); adviesprijs vermoedelijk ook, te bevestigen |
| 2026-10-05 | D-37 | Eigenaar: geen uitzondering op `pnpm audit`, wachten op een gerepareerde `braces`; ESLint blijft |
| 2026-10-05 | D-17, D-32 | Taal in de URL en eigen vertaaloplossing, alleen winkelteksten (D-32); Vitest en Playwright (D-17, verder open). Pakketten voor fase 1 goedgekeurd: next, react, react-dom, typescript met types, tailwindcss met @tailwindcss/postcss, eslint met eslint-config-next, vitest |
| 2026-10-05 | D-01, D-02 | Beslist door de eigenaar: BigBuy (D-01); selectieregel en toegestane subcategorieën, gereviseerd uitgesloten, InnovaGoods toegestaan (D-02). D-04, D-13, D-16, D-22 van BLOCKED naar OPEN |
| 2026-10-05 | D-36 | Beslist door de eigenaar: woningtextiel later, uitsluitingslijst akkoord |
| 2026-10-05 | D-05, D-13, D-34, D-35 | Voorstellen uit `docs/ONDERZOEK.md` doorgevoerd: iDEAL als eis (D-05), levertijd tonen (D-13), wettelijke productinformatie (D-34, open; standpunt eigenaar over oud voor nieuw vastgelegd), inhoud eerste versie (D-35) |
| 2026-10-05 | D-00, D-30, D-32 | D-30 bevestigd door de eigenaar; Nederlands standaardtaal (D-32); opgave eigenaar dat Next.js op Hostinger draait (D-00) |
| 2026-10-05 | D-00, D-14, D-32, D-33 | Beslist door de eigenaar: Next.js, TypeScript, pnpm, Tailwind, Hostinger (D-00); euro en Nederland (D-14); Nederlands en Engels (D-32); eerste versie zonder donkere modus (D-33, open). D-05, D-06, D-17, D-18 van BLOCKED naar OPEN: D-00 is beslist, de informatie is nog niet compleet |
| 2026-10-05 | D-04 | Documenten aangepast aan automatisch inkopen (beheer, mail, state machine, dreigingsmodel, observability, idempotentie, checklist); wat er na een mislukte inkoop gebeurt blijft open |
| 2026-10-05 | D-00, D-04, D-31 | Hostingpakket vastgelegd bij D-00; antwoord van de eigenaar op D-04 (automatisch inkopen) vastgelegd, status blijft BLOCKED tot D-01; D-31 toegevoegd |
| 2026-10-04 | D-29, D-30 | Set geplaatst in het WonZo-project; D-29 toegevoegd (OPEN); correcties goedgekeurd door de eigenaar (D-30); aannamelijsten bij D-00 en D-06 |
