# WonZo — Huisstijl

**Dit document is leidend voor alle UI.** Staat er iets niet in, dan is dat een
vraag aan de eigenaar en geen eigen keuze. Wijk hier nooit van af omdat iets
"mooier" is; een huisstijl die per scherm een beetje anders is, is geen
huisstijl.

**Bron:** de huisstijl van WonZo (brandbook, tokens en logobestanden),
aangeleverd door de eigenaar op 2026-10-04. Het brandbook noemt zichzelf een
eerste versie, "een voorstel om op verder te bouwen". Wat er nog ontbreekt
staat hieronder als plaatshouder of als open punt.

**Het idee** (uit het brandbook): Wonzo komt van *wonen*. De **w** heeft een
hoge middenpunt — een dakje, het huis. De laatste **o** is een aan-knop in
Wonzo-oranje — de apparaten. Warm en nuchter: een winkel die je vertrouwt
omdat hij eerlijk is, niet omdat hij schreeuwt.

---

## Wat er van de ontwerper moet komen

- [x] **Logo als SVG met outlines** — het woordmerk bestaat uit paden, zonder
      tekst-element (gecontroleerd 2026-10-04).
- [ ] **Alle varianten** — er zijn: volledig logo, een lichte versie voor
      donkere achtergrond en het beeldmerk. Er ontbreken: een lijnversie voor
      kleine formaten en een deelplaatje (1200×630).
- [x] **Hexwaarden** van alle merkkleuren.
- [ ] **Namen van de lettertypen** zijn er; de licentie om ze zelf te hosten
      is nog niet vastgelegd (zie § Typografie).
- [x] **De regels**: minimale afmeting, vrije ruimte, wat verboden is.
- [ ] Nog te leveren volgens het brandbook zelf: foutkleuren, een donker
      thema (voor het beheer), een fotostijl, componenten.

---

## Kleur

### Merkkleuren

| Token | Hex | Gebruik |
|---|---|---|
| `--accent` | `#C8440C` | Wonzo-oranje. De **ene belangrijkste actie** per scherm (In winkelwagen, Afrekenen), de verkoopprijs, de aan-knop in het logo. Nooit decoratie |
| `--ink` | `#1D1A17` | Koppen, tekst, het woordmerk |
| `--grey` | `#E6DED3` | Decoratieve scheidingslijnen tussen rijen en kaartdelen (brandbook: `line`). Nooit de enige rand van een bedieningselement |
| `--zinc` | `#FAF6F0` | Paginavlak, warm gebroken wit (brandbook: `surface`) |
| `--petrol` | `#0E4D4A` | Vertrouwen: header, footer, infobanners, secundaire knoppen |
| `--focus` | `#4B2E2B` | Focusring op lichte vlakken ("Coffee Bean" uit het palet "Warm Mocha Vibes", aangeleverd 2026-10-05) |
| `--focus-on-dark` | `#F5ECE3` | Focusring op petrol en ink ("Soft Cream", zelfde palet) |
| `--brand-soft` | `#FCE3D3` | Alleen als vlak achter promoties en kortingsvlaggen, altijd met `--ink`-tekst. Te dicht bij het paginavlak om zonder rand als vorm te staan (1,14:1) |

### Semantische tokens — hier werkt de UI mee

Componenten gebruiken **nooit** de merkkleuren rechtstreeks. Ze gebruiken de
laag hieronder. Dat is wat donkere modus op één plek laat wonen in plaats van
in tweehonderd componenten.

```css
:root {
  --background: #FAF6F0;   /* paginavlak (brandbook: surface) */
  --foreground: #1D1A17;   /* gewone tekst (ink) */
  --surface:    #FFFFFF;   /* productkaarten, winkelwagen, checkout, invoervelden, beheertabellen (surface-raised) */
  --muted:      #6B635A;   /* secundaire tekst: artikelnummer, levertijd, hulptekst (ink-muted) */
  --border:     #8C8276;   /* randen van invoervelden, vinkjes, aantalkiezer (border-control) */
  --line:       #E6DED3;   /* alleen decoratieve scheidingslijnen */
  --in-stock:   #1F7A3A;   /* alleen de voorraadstatus: "Op voorraad" en de stip */
  --danger:     <<TOKEN_DANGER>>;   /* fouten — nog niet aangeleverd */
  --success:    <<TOKEN_SUCCESS>>;   /* bevestiging — nog niet aangeleverd */
  --warning:    <<TOKEN_WARNING>>;   /* "wordt besteld", let op — nog niet aangeleverd */
}

.dark {
  /* nog niet aangeleverd — zie § Donkere modus */
}
```

**`--muted` is niet het merkgrijs.** `--grey`/`--line` (1,24:1 op het
paginavlak) is decoratief; `--muted` haalt 5,48:1 en is voor tekst.

**Statuskleuren staan los van het accent.** "Op voorraad" mag nooit de
merkkleur zijn: dan leest een statusmelding als een knop. Het brandbook
reserveert `--in-stock` voor de voorraadstatus alleen; een succesmelding
krijgt daarom een eigen token (`--success`, nog open).

### Contrast — eerst meten, dan gebruiken

WCAG 2.2 AA vraagt **4,5:1** voor normale tekst, **3:1** voor grote tekst
(vanaf 24px, of 18,66px vet) en voor UI-elementen zoals randen van
invoervelden.

GEMETEN 2026-10-04 — berekend met de formule voor relatieve luminantie uit
WCAG 2.2 op de hexwaarden hierboven (geen schermmeting). De waarden die het
brandbook zelf noemt (4,9 / 16 / 5,5 / 5,9 / 1,2 / 3,5 / 14 / 9,6 / 5) kloppen.

| Combinatie | Ratio | Toegestaan? |
|---|---|---|
| accent op wit | 4,90:1 | ja, ook normale tekst |
| accent op paginavlak (`#FAF6F0`) | 4,55:1 | ja, maar krap: geen lichtere ondergrond dan deze |
| wit op accent | 4,90:1 | ja, ook normale tekst |
| ink op accent | 3,54:1 | alleen grote tekst |
| muted op wit | 5,90:1 | ja |
| muted op paginavlak | 5,48:1 | ja |
| accent op ink (donkere modus) | 3,54:1 | alleen grote tekst en UI-onderdelen |
| ink op paginavlak / op wit | 16,09:1 / 17,32:1 | ja |
| ink op brand-soft | 14,08:1 | ja |
| accent op brand-soft | 3,98:1 | alleen grote tekst (de prijsstijl, 20px vet) |
| wit op petrol | 9,64:1 | ja |
| accent op petrol | 1,97:1 | **nee**, ook niet als UI-onderdeel |
| in-stock op paginavlak / op wit | 5,00:1 / 5,38:1 | ja |
| border op paginavlak / op wit | 3,50:1 / 3,77:1 | ja, als rand van een bedieningselement |
| line op paginavlak / op wit | 1,24:1 / 1,33:1 | **nee** als rand van een bedieningselement; alleen decoratief |
| focus `#4B2E2B` op paginavlak / op wit / op brand-soft | 11,31:1 / 12,17:1 / 9,89:1 | ja |
| focus `#4B2E2B` tegen accent / tegen petrol | 2,49:1 / 1,26:1 | **nee** — daarom een ring mét tussenruimte, en op petrol de lichte focuskleur |
| focus-on-dark `#F5ECE3` op petrol / op ink | 8,26:1 / 14,84:1 | ja |

**De regels die hieruit volgen:**

- De primaire knop is een accentvlak met **witte** tekst (4,90:1). Niet de
  donkere merkkleur: ink op accent haalt 3,54:1, te weinig voor knoptekst.
- Accentkleurige tekst mag op wit en op het paginavlak (4,90 en 4,55:1) —
  maar het brandbook gebruikt het accent alleen voor de hoofdactie en de
  verkoopprijs. Links en gewone tekst zijn niet oranje.
- Op `--brand-soft` is accentkleurige tekst alleen toegestaan in de grote
  prijsstijl; gewone tekst daar is `--ink`.
- **Nooit oranje op petrol** (1,97:1): geen oranje knop, link of icoon in de
  header of footer. De aan-knop-o in het lichte woordmerk op petrol valt als
  logo buiten de contrasteis (WCAG 1.4.3 uitzondering voor logo's), maar is
  daar slecht zichtbaar — voorleggen aan de ontwerper.
- In een donkere modus haalt het accent op ink alleen 3:1: dan alleen voor
  grote tekst, vlakken en UI-onderdelen, niet voor gewone tekst.
- Een rand van een invoerveld is `--border` (3,50:1), nooit `--line`.
- **Focus:** een ring van 2px in `--focus` met 2px tussenruimte
  (`outline-offset`), zodat hij tegen het paginavlak staat en niet tegen het
  oranje van een knop (2,49:1). In de petrol header en footer `--focus-on-dark`.
  De andere tinten uit het palet halen het niet: Cinnamon Spice 1,50:1 tegen
  oranje, Caramel Drizzle 3,87:1 op het paginavlak maar 1,17:1 tegen oranje,
  Oat Milk en Soft Cream minder dan 2:1 op licht.

### Donkere modus

De eerste versie heeft geen donkere modus (D-33; later beslissen). Het
brandbook kent alleen een licht thema. Komt er een, dan krijgt hij een eigen
set waarden voor dezelfde tokens en een eigen contrasttabel.

Twee dingen die altijd misgaan, ook nu al:

- **Een vast ingestelde kleur in een component blijft staan in de andere
  modus.** Een blok met een hardgecodeerde donkere achtergrond leest in lichte
  modus als een fout. Uitzonderingen mogen, maar met een reden in het
  commentaar.
- **Geef `body` expliciet een achtergrond** (`--background`). Een
  doorzichtige pagina leent de kleur van iets anders en dat gaat ergens stuk.

---

## Logo

Bestanden in `public/brand/`:

| Bestand | Gebruik |
|---|---|
| `wonzo-wordmark.svg` | Volledig logo, op het paginavlak of wit |
| `wonzo-wordmark-light.svg` | Volledig logo, alleen op petrol of ink |
| `wonzo-mark.svg` | Beeldmerk: witte dak-w op een oranje afgerond vierkant — app-icoon, favicon, avatar |
| `png/wonzo-wordmark-1744px.png`, `png/wonzo-wordmark-light-1744px.png` | PNG-versies, bijv. voor de mailsjabloon (mailclients kennen geen SVG) |
| `png/wonzo-mark-32px.png`, `png/wonzo-mark-512px.png` | Beeldmerk als PNG |
| lijnversie voor kleine formaten | **ontbreekt** |
| deelplaatje 1200×630 | **ontbreekt** |

**Regels** (uit het logogebruik van de ontwerper, hard):

- Minimale afmeting: 96px breed voor het woordmerk, 24px voor het
  beeldmerk.
- Vrije ruimte rondom: minstens de hoogte van de o, aan elke kant.
- Nooit uitrekken, roteren, van schaduw voorzien of inkleuren. **De aan-knop-o
  nooit herkleuren en nooit vervangen door een gewone o.**
- Het woordmerk is getekend, niet gezet: **nooit in een lettertype
  nabouwen.**
- Het accent komt **één keer** per logo voor: de aan-knop.

---

## Typografie

| Rol | Lettertype | Gewicht | Opmerking |
|---|---|---|---|
| Woordmerk | geen — getekend (paden) | | Alleen in het logo, nooit in de UI |
| Koppen | Bricolage Grotesque | 700 (display, h1), 600 (h2) | `letter-spacing: -0.02em` (display), `-0.01em` (h1) |
| Body | DM Sans | 400 | 16px op 24px regelhoogte |
| Labels | DM Sans | 600 | 13px op 16px, `letter-spacing: 0.02em`, hoofdletters ("OP VOORRAAD") |

Terugval: `"Bricolage Grotesque", "DM Sans", system-ui, sans-serif` voor
koppen; `"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif` voor de
rest.

**Typeschaal** (uit de tokens; blijf erop):

| Stijl | Maat / regelhoogte | Gewicht | Gebruik |
|---|---|---|---|
| `display` | 56 / 56 | 700 | homepage-hero, campagnekoppen |
| `h1` | 36 / 40 | 700 | titel van categorie- en productpagina |
| `h2` | 24 / 30 | 600 | sectiekoppen, paginatitels in het beheer |
| `body` | 16 / 24 | 400 | standaardtekst, productomschrijving |
| `body-sm` | 14 / 20 | 400 | meta-info, tabelcellen in het beheer |
| `label` | 13 / 16 | 600 | badges, formulierlabels, filterchips |
| `price` | 20 / 24 | 700 | prijzen op kaarten en productpagina's, met `tabular-nums` |

Lopende tekst rond de 65 tekens breed. Langer leest slecht, en op een
productpagina leest niemand het dan nog.

**Cijfers**: `font-variant-numeric: tabular-nums` voor prijzen, aantallen en
artikelnummers. Dat zijn data; die moeten in een kolom uitlijnen.

**Zelf hosten**, niet van een extern lettertypedomein laden. Dat scheelt een
derde partij in de privacyverklaring en een verbinding bij het laden. Het
brandbook noemt Google Fonts als bron; dat zij de licentie geven om zelf te
hosten (SIL Open Font License) is een `AANNAME` tot de licentiebestanden zijn
gecontroleerd en meegeleverd.

---

## Ruimte, randen en schaduw

```
spacing  8 · 16 · 24 · 40          (space-2, space-4, space-6, space-10 — stappen van 8)
radius   6px klein (invoervelden, badges, kleine chips)
         12px groot (knoppen, productkaarten, panelen)
         999px pil (filterchips, aantalkiezer, voorraadstip)
shadow   één zachte schaduw, voor wat echt boven de pagina zweeft — nog niet aangeleverd
```

Hoeken zijn altijd rond, nooit scherp (brandbook).

**Niet alles is een kaart.** Rand, vlak, afronding en schaduw zeggen alle vier
"dit is een los object". Geef je ze aan elk blok, dan is er geen hiërarchie
meer en ziet de pagina eruit als een lijst dozen. Besteed ze aan het ene ding
dat de aandacht moet hebben.

---

## Componenten — hoe het merk eruitziet in de praktijk

Dit zijn geen implementatiedetails maar merkbeslissingen. Leg ze één keer vast
en dan zijn ze overal hetzelfde. Het brandbook noemt de componenten zelf nog
"te doen"; hieronder staat wat er al uit volgt.

| Component | Vorm |
|---|---|
| Primaire knop | Accentvlak, witte tekst (4,90:1), radius 12px |
| Secundaire knop | In petrol (brandbook); vlak met witte tekst (9,64:1) of omlijnd — nog vast te leggen |
| Tertiair | Alleen tekst met onderlijn |
| Invoerveld | Achtergrond `--surface`, rand `--border`, radius 6px; fout: rand `--danger` **plus** tekst |
| Statusbadge | Eigen kleurpaar per status, altijd met icoon **én** woord; radius 6px |
| Kortingsvlag | `--brand-soft`-vlak met `--ink`-tekst, kort: `-15%` |
| Focus | Ring van 2px in `--focus` (`#4B2E2B`) met 2px tussenruimte; op petrol `--focus-on-dark` (`#F5ECE3`); nooit `outline: none` zonder vervanging |

**Eén primaire actie per scherm.** Twee accentknoppen naast elkaar laten de
klant kiezen waar niets te kiezen valt.

**Kleur draagt nooit alleen de boodschap** (WCAG 1.4.1). Elke status heeft een
eigen icoon en een eigen woord, niet alleen een kleur.

---

## Beeld

- **Productfoto's** komen van de leverancier en zijn niet te sturen. Zet ze op
  een vast vlak (`--surface`, wit) met een vaste verhouding en
  `object-fit: contain`, anders springt de pagina bij elke foto.
- **Geen foto?** Een eigen plaatshouder met het beeldmerk, gedempt. Nooit een
  gebroken plaatje en nooit een lege ruimte.
- **Sfeerbeeld** (<<SFEERBEELD_JA_NEE>>): afspreken met de eigenaar; de
  fotostijl is volgens het brandbook nog te doen. Gekochte stockfoto's die
  niet bij het assortiment horen doen meer kwaad dan goed.
- **Iconen**: één set, lijniconen met 2px lijn en ronde uiteinden (het
  brandbook noemt Lucide als voorbeeld; een set kiezen is een dependency en
  wordt eerst gevraagd). Kleur `--foreground` of `--muted`, nooit het accent
  behalve in de actieve knop.

---

## Tone of voice

Uit het brandbook:

- **Je en jij**, korte zinnen, gewone woorden. "Bezorgd binnen 3–5
  werkdagen", niet "Uw bestelling wordt zo spoedig mogelijk verwerkt". (Dat
  getal is een voorbeeld van de toon, geen belofte: de levertijd komt uit de
  gegevens van de leverancier en D-13.)
- **Eerlijk over levertijd.** Producten komen uit een Europees magazijn;
  beloof nooit "morgen in huis".
- **Geen druk.** Geen nep-aftelklokken of "nog maar 2 mensen kijken". Een
  korting mag gewoon een korting zijn.
- Getallen in Nederlands formaat: `€ 49,95`, `3–5 werkdagen`.
- Het logo is lowercase en zonder Engelse slogan; de site ook geen Engelse
  slogans.

Wat bij een webshop vrijwel altijd geldt:

- Direct en zakelijk, geen marketingtaal. De klant zoekt een product, geen
  belevenis. "Past op jouw <<PRODUCTSOORT>>" is beter dan "Ontdek onze collectie".
- Een knop zegt wat er gebeurt: "Bestellen en betalen", niet "Versturen".
- Een foutmelding zegt wat er misging én wat de klant eraan kan doen. Geen
  excuses, geen vaagheid.
- Een lege staat is een uitnodiging, geen mededeling. Niet "geen resultaten"
  maar "niets gevonden voor X — probeer Y".
- Noem dingen zoals de klant ze noemt, niet zoals het systeem ze noemt.

---

## Als de huisstijl binnenkomt

1. ~~Vul de hexwaarden in, en de semantische tokens erbij.~~ Gedaan
   2026-10-04, focuskleur 2026-10-05; `--danger`, `--success` en `--warning`
   ontbreken.
2. ~~Reken de contrasttabel uit~~ en pas de regels aan — gedaan 2026-10-04
   voor het lichte thema; het donkere thema volgt als het er is.
3. ~~Zet de logobestanden in `public/brand/`.~~ Gedaan; lijnversie en
   deelplaatje ontbreken.
4. Vul de lettertypen in (gedaan), host ze zelf met de licentie erbij, en zet
   de typeschaal in de CSS (bij fase 1).
5. Loop de componenttabel langs en leg per rij de echte waarde vast.
6. Haal elke plaatshouder (`<<NAAM>>`) uit dit bestand. Wat er dan nog staat, is een gat dat
   iemand moet dichten.
