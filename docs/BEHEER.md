# Beheerpaneel — wat de eigenaar nodig heeft

De winkel is voor de klant, dit paneel is voor de eigenaar. Dat is een ander
soort scherm: het wordt niet gelezen maar **bediend**, elke dag, vaak haastig
en vaak op een telefoon.

Inloggen, rechten en het logboek staan in `.claude/rules/beveiliging.md`. Dit
bestand gaat over wat er op de schermen hoort. Rollen, pad en wat er gebouwd
wordt: D-07.

**Gebouwd (fase 6, 2026-10-12):** `/beheer` met het dashboard, de
bestellijst, het scherm per bestelling en de knoppen bij een bestelling die
aandacht vraagt (`src/app/beheer/`, `src/lib/admin/`). Inloggen komt als
laatste (D-07); tot dan opent het paneel alleen lokaal.

**Aangevuld (2026-10-15)**, na het naast de bouwbeschrijving van de eigenaar
leggen: in de bestellijst per regel de stand bij BigBuy; bij een inkooporder
zonder uitsluitsel de knop "status opvragen bij BigBuy" (op de eigen
referentie, nooit opnieuw bestellen); een waarschuwing als BigBuy een andere
inkoopprijs rekende dan bevroren; zoeken in de facturen op nummer,
ordernummer, naam, mailadres of bedrag (met POST: geen persoonsgegeven in de
URL); bij elke open retour de wettelijke klok (14 dagen na de melding), en
een melding voor iedereen op het dashboard als er retouren wachten; op het
dashboard de facturen per jaar en maand (recht "facturen") en het bezoek met
de trechter winkelwagen → afrekenen → betaling gestart → betaald (recht
"statistieken", uit de eigen telling en de bestellingen — geen volgen per
bezoeker, D-10). Nog niet, wachtend op een beslissing: prijzen (D-16, D-03),
kortingen en codes (D-08), beoordelingen (D-12); beheerders en inloggen
(6a) als laatste.

---

## De grondvraag

**Een beheerscherm beantwoordt "wat moet ik nu doen", niet "hoe gaat het".**
Een getal waar geen handeling bij hoort is decoratie. Bouw geen grafieken die
niemand gebruikt om een beslissing te nemen — dat is de makkelijkste manier om
een paneel te maken dat er indrukwekkend uitziet en waar de eigenaar niets aan
heeft.

Bij elk blok dat je toevoegt: **welke handeling volgt hieruit?** Is het
antwoord "geen", dan hoort het er niet.

---

## Dashboard

Het eerste scherm na het inloggen. Hooguit een handvol tegels, en elke tegel is
een deur naar werk dat openstaat.

| Tegel | Waarom het werk is |
|---|---|
| Inkoop vastgelopen: inkooporder `UNKNOWN` of `REJECTED` (bijv. te weinig tegoed bij de leverancier) | inkopen gaat automatisch (D-04); hier staat alleen wat niet lukte: meer dan 10 % duurder (de eigenaar besluit), geweigerd (wordt 24 uur opnieuw geprobeerd), na 24 uur opgegeven (opnieuw proberen of annuleren en terugbetalen), of antwoord onbekend (wordt nagevraagd op het ordernummer) |
| Tegoed bij de leverancier | te weinig tegoed laat de volgende inkoop mislukken; opwaarderen vóór het zover is |
| **Vraagt aandacht**: order on hold, betaald na verloop, bedrag wijkt af, terugbetaling of inkooporder `UNKNOWN`/`FAILED`/`REJECTED`, mail die niet weg kan | hier is iets mis dat een mens moet beslissen (`docs/PAYMENTS.md`) |
| Omzet deze maand | de enige die puur informatief mag zijn |
| Openstaande retouren | hier wacht een klant op geld |
| Beoordelingen die aandacht vragen | een lage score hoort beantwoord |

De tegel "vraagt aandacht" is leeg in een gezonde winkel. Staat er iets in, dan
staat er per regel wat er moet gebeuren.

Zet bij een bedrag dat later nog verandert erbij **wat het is**: "omzet, vóór
retouren" is een ander getal dan "omzet". Een tegel die stilletijd iets anders
betekent dan de boekhouding is erger dan geen tegel.

**Een lege nieuwe winkel heeft lege tegels.** Zorg dat die er dan niet uitzien
als een fout: "nog geen bestellingen" is een zin, geen streepje.

---

## Bestellingen — de werkvoorraad

### De lijst

Dit is geen archief maar een wachtrij. Sorteer op wat er nog moet gebeuren,
niet alleen op datum.

- Per regel: ordernummer, datum, klant, bedrag, status, en **of er al
  bij de leverancier besteld is** (status van de inkooporder).
- Zoeken op ordernummer en op mailadres. Dat zijn de twee dingen waarmee een
  klant belt.
- Filteren op status, en een duidelijk onderscheid tussen "betaald, nog niets
  gedaan" en "afgehandeld".
- Paginering. Een lijst die alles ophaalt werkt prima bij vijftig bestellingen
  en valt om bij vijfduizend.

### De bestelling zelf

Inkopen gebeurt automatisch (D-04): dit scherm is geen werkbon maar een
**controlescherm**. De eigenaar moet hier in één oogopslag zien of de inkoop
gelukt is, en zo niet, waarom.

- De regels met het artikelnummer **zoals de leverancier het kent**, niet zoals
  de klant het ziet.
- Komen de artikelen bij twee bronnen vandaan, dan staat dat er met een
  waarschuwing bij: dat worden twee inkooporders.
- Het afleveradres in één blok, zo over te nemen.
- Bedragen zoals ze op de factuur staan: subtotaal, korting, verzending, btw.
- **Per inkooporder de status bij de leverancier**, met het ordernummer daar,
  de eigen referentie die is meegestuurd en de werkelijke inkoopprijs
  (`docs/STATE_MACHINES.md` § Supplier order). Wijkt de inkoopprijs af van de
  snapshot, dan zegt het scherm dat.
- **Staat een inkooporder op `UNKNOWN`**: een knop "status opvragen bij de
  leverancier" (op de eigen referentie) — nooit "opnieuw bestellen".
- De aanbieding (verkoper) waarmee gerekend is, zodat er bij dezelfde wordt
  ingekocht.
- De betaalstatus, met het kenmerk van de betaaldienst erbij voor als er iets
  nagezocht moet worden.

---

## Facturen

- Nummering, inhoud en creditnota's: `docs/FACTUUR.md`.
- Te downloaden als PDF, en terug te vinden op nummer.
- Een overzicht per maand met de btw per tarief: dat is wat de boekhouder
  vraagt.

---

## Prijzen

Hier stelt de eigenaar zijn marge in. Twee dingen maken het verschil tussen
bruikbaar en eng:

- **Laat zien wat een instelling doet met een echt artikel** voordat hij
  opslaat. "15% opslag" zegt niets; "dit filter gaat van € 8,40 naar € 9,66"
  zegt alles.
- **Zeg het als de ondergrens ingrijpt.** Vraagt de eigenaar 40% korting en kan
  de marge er maar 9%, dan hoort het paneel dat te melden — niet stilletjes 9%
  toepassen en 40% blijven tonen.

De volledige opbouw — prijsregel, actie, code en hun onderlinge grenzen — staat
in `docs/PRIJZEN.md`.

Leg vast waaraan een prijsregel hangt, en gebruik overal dezelfde sleutel. Een
regel die op de ene pagina geldt en bij het afrekenen niet, laat de klant een
ander bedrag betalen dan hij zag.

---

## Kortingen en acties

- Een actie wijst een groep aan, met een begin- en einddatum.
- **Stoppen is niet weggooien.** Een afgelopen actie blijft staan, anders is
  over een half jaar niet meer te verklaren waarom een oude bestelling die
  prijs had.
- Overlappende acties: zeg welke wint (de hoogste, en niet stapelen) en toon
  dat ook.
- Kortingscodes zijn iets anders dan acties: percentage, minimumbedrag,
  looptijd, een maximum aantal, en eventueel "één keer per klant" — dat laatste
  hangt aan een unieke sleutel in de database, niet aan een controle in code.
- Bij een actie op een groep die je niet kunt uitlijsten: zeg dat in het
  paneel. Anders zet de eigenaar een actie aan die werkt maar nergens
  zichtbaar is, en denkt hij dat er iets stuk is.

---

## Retouren

- Aanvragen komen binnen met ordernummer en mailadres, al gecontroleerd.
- Drie knoppen in volgorde: **ontvangen** → **terugbetalen** → of **afwijzen
  met reden**.
- **Terugbetalen is de enige knop in het hele paneel die geld verplaatst.** Dus
  met een bevestiging met het exacte bedrag, en het bedrag wordt server-side
  berekend — nooit overgenomen uit het formulier.
- Wat er in de administratie komt is wat de betaaldienst zegt te hebben
  teruggeboekt. Verschilt dat van wat er gevraagd was, dan zegt het scherm dat.
  Staat een terugbetaling op `UNKNOWN`, dan toont het scherm dat en biedt het
  "status opvragen" — geen tweede "terugbetalen"-knop.
- Afwijzen vraagt een reden, en die reden wordt vastgelegd.

**Gebouwd (2026-10-13):** `/beheer/retouren` en een blok bij elke bestelling:
**pakket ontvangen**, dan **akkoord: terugbetalen** (het maximum staat
ingevuld; lager mag met een reden, de knop noemt eerst het exacte bedrag) of
**niet akkoord**. Wie er komt: het recht "retouren"; terugbetalen vraagt
"terugbetalen" — allebei alleen de eigenaar (D-07). Een open retour staat in
"vraagt aandacht". Daarnaast **als afgeleverd markeren**: BigBuy meldt de
aflevering, maar welke woorden het daarvoor gebruikt is nog niet gemeten.

---

## Beoordelingen

**Gebouwd (2026-10-15, D-12):** `/beheer/beoordelingen` (recht
"beoordelingen", ook marketing): alle, lage score zonder antwoord, verborgen;
antwoorden, verbergen en weer tonen met een reden (logboek); de bestellingen
die nog een uitnodiging krijgen, met de datum. Het scherm toont het
ordernummer, nooit de naam of het adres van de klant. Op het dashboard het
aantal lage scores zonder antwoord. Nog niet: een beoordeling echt wissen op
verzoek van de klant (nu: verbergen met die reden).

- Verschijnen meteen; verbergen kan alleen **met een reden**. Selectief
  publiceren is een oneerlijke handelspraktijk.
- Antwoorden werkt beter dan weghalen.
- Een verzoek om verwijdering moet uitvoerbaar zijn: daarvoor moet je weten
  welke beoordeling van wie is.

---

## Beheerders

- De eerste komt uit een opzetpagina die **zichzelf sluit** zodra er één is.
- Daarna met uitnodigingen, met een vervaltermijn op de link.
- Rechten per onderdeel, ook met één beheerder. Zodra er een tweede bijkomt wil
  je kunnen zeggen: wel bestellingen, geen prijzen.
- **Het logboek is zichtbaar in het paneel**, niet alleen in de database. Wie,
  wat, wanneer, waarop. Gebouwd (2026-10-13): `/beheer/logboek`, recht
  "logboek" (alleen de eigenaar).
- **Gebouwd (2026-10-19, D-07):** `/beheer/inloggen` (mailadres, wachtwoord en
  code in één formulier), `/beheer/opzetten` (de eerste eigenaar, met
  `ADMIN_SETUP_TOKEN`; sluit zichzelf), `/beheer/uitnodiging/<sleutel>`,
  `/beheer/beheerders` (recht "beheerders": uitnodigen, rol, uitschakelen,
  toegang opnieuw instellen) en `/beheer/account` (sessies, overal
  uitloggen, nieuwe herstelcodes). Telefoon kwijt: inloggen met een
  herstelcode, of een andere eigenaar stelt de toegang opnieuw in. Het
  logboek toont de naam van de beheerder.

---

## Hoe een beheerscherm eruitziet

Dit is bewust anders dan de winkel. De winkel verleidt, het paneel werkt.

- **Dicht op elkaar.** Een tabel met twintig regels op een scherm, geen kaart
  per bestelling met veel wit eromheen.
- **Cijfers in kolommen** die uitlijnen (`tabular-nums`). Bedragen rechts.
- **Status als chip met een woord**, niet alleen een kleur.
- **Gevaarlijke knoppen zien er anders uit** en staan niet naast een knop die
  je vaak gebruikt. Terugbetalen, annuleren, verwijderen en afwijzen vragen
  een bevestiging waarin staat wát er gaat gebeuren, op welk object — en bij
  geld: hoeveel. De volledige eisen (recht, reden, audit, idempotentie):
  `.claude/rules/beveiliging.md` § Destructieve en financiële handelingen.
- **Geen merkaccent voor statussen.** Het accent is van de winkel; een
  statuskleur die eruitziet als een knop is verwarrend.
- **Eén taal.** Een paneel voor één persoon hoeft niet tweetalig te zijn.

### Formulieren die gebruikt worden

- **Een mislukt formulier houdt zijn waarden.** Niets is irritanter dan
  opnieuw invullen omdat één veld fout was. Dit gaat vaak stuk zonder dat
  iemand het merkt — controleer het expliciet.
- Na een geslaagde handeling: een melding die zegt wat er gebeurd is, en een
  scherm dat ververst is. Geen scherm dat nog de oude toestand toont.
- Een knop die iets verstuurt is tijdens het versturen uitgeschakeld en zegt
  dat hij bezig is. Twee keer klikken mag nooit twee handelingen opleveren.
- Fouten in gewone taal: "Het bedrag moet tussen € 0,01 en € 5,94 liggen" in
  plaats van "validatiefout".

### Op een telefoon

De eigenaar krijgt de bestelmelding op zijn telefoon en kijkt daar als eerste.
Minstens moeten werken: de bestelling bekijken, zien of de inkoop gelukt is,
en een retour afhandelen. Een tabel die op een telefoon uit beeld loopt is daar
onbruikbaar — laat kolommen vallen in plaats van horizontaal te scrollen.

---

## Lessen uit een ander paneel

Uit een bouwbeschrijving van een paneel dat al draait (aangeleverd door de
eigenaar, 2026-10-12). Elk punt is daar één keer misgegaan.

- **Een werkende sleutel is geen werkende kassa.** Toets of een dienst echt
  werkt, niet of er een sleutel staat: Mollie zette daar na een wijziging bij
  de KvK elke methode op "wordt geverifieerd", en twee weken lang stond er een
  betaalknop die niets deed. Hier: `src/lib/payments/health.ts` vraagt Mollie
  welke methodes werken (vijf minuten bewaard), `src/lib/catalog/bigbuy/health.ts`
  leest de stand van de sleutel uit de calls die de catalogus toch al doet.
  Onderscheid: geen sleutel / geweigerd / onbereikbaar / werkt maar doet
  niets. Een rode melding voor iedereen, ongeacht rol, en de klant hoort het
  op de afrekenpagina vóórdat er iets is ingevuld. **Een afgevangen fout ziet
  eruit als een lege toestand.**
- **Een losse route erft geen beveiliging van een layout.** Een factuur-PDF
  die alleen toetste "is er iemand ingelogd" liet iedereen met een account
  facturen ophalen door te tellen. Elke pagina, server action en route
  handler roept zelf `requirePage` of `requireAction` aan
  (`src/lib/admin/access.ts`).
- **Niet ophalen is iets anders dan verbergen.** Wat iemand niet mag zien,
  haalt de server niet op; anders zit het toch in de pagina-data.
- **Een cast is geen validatie.** `selectRows<AdminRow>` belooft een vorm die
  niemand controleert: een SELECT die een nieuwe rechtenkolom niet noemde,
  maakte daar iedereen stil tot de minst bevoorrechte rol. Rijen die over
  rechten gaan: valideren, en luid falen.
- **De laatste actieve eigenaar kan zichzelf niet degraderen of
  uitschakelen.** Bouw dat als eerste, niet als laatste (fase 6a).
- **De rechtenlijst raakt de database niet** (`src/lib/admin/permissions.ts`):
  een knop in de browser mag hem importeren zonder een databasedriver mee te
  trekken. Typecheck en lint zien dat niet; alleen de pagina openen of bouwen.

Waar die beschrijving afweek van de regels van WonZo, gelden de regels van
WonZo (gemeld aan de eigenaar, 2026-10-12): terugbetalen legt eerst de
intentie vast en dan pas Mollie (`docs/PAYMENTS.md`), niet "eerst de
betaaldienst"; de limiet op inloggen staat in de database, niet in het
geheugen van één proces; een gebruikte 2FA-code wordt geweigerd; zoeken op
mailadres gaat met POST, zodat het adres niet in een URL en een log komt; en
een bezoekerstrechter blijft weg zolang D-10 er niet over beslist heeft (zie
hieronder).

---

## Statistieken

**Gebouwd (2026-10-15, D-10):** `/beheer/statistieken`, recht
"statistieken" (eigenaar en marketing): paginaweergaven per dag en de meest
bekeken pagina's over 7, 30 of 90 dagen. Geteld op de eigen server, zonder
cookies en zonder iets over de bezoeker (`src/lib/stats.ts`).

## Wat er bewust niet in hoort

- **Analyses die niemand gebruikt.** Bezoekersaantallen, conversiegrafieken,
  een verkooptrechter: mooi, en geen enkele handeling volgt eruit. Komt er
  vraag naar, dan bouw je het dan.
- **Rechtstreeks in de database kunnen.** Een paneel dat willekeurige
  wijzigingen toestaat omzeilt elke regel die je in code hebt gezet.
- **Een knop die opnieuw bestelt bij de leverancier.** Inkopen gebeurt
  automatisch, één keer per betaalde bestelling. Na 24 uur weigeringen kiest de
  eigenaar "opnieuw proberen" (D-04): dat is dezelfde inkooporder met
  hetzelfde ordernummer bij BigBuy, nooit een tweede bestelling. Een knop
  "nieuwe bestelling bij BigBuy" komt er niet: die wordt een keer per ongeluk
  geraakt.
