# Prijzen, acties en kortingscodes

Drie dingen verlagen een prijs, en ze kennen elkaar niet vanzelf. Dit bestand
legt de volgorde vast en de grenzen waar ze elkaar raken. Zonder die volgorde
krijg je een winkel die soms met verlies verkoopt en die niet kan uitleggen hoe
een bedrag tot stand kwam.

Het rekenwerk zelf (geldmodel, afronding, volgorde) staat in
`.claude/rules/geld.md`. Dit gaat over de regels.

---

## Vier begrippen

`supplierCost` (inkoop van de gekozen aanbieding), `landedCost` (wat een stuk
de winkel werkelijk kost), `sellingPrice` (wat de klant betaalt) en `margin`
(verkoop excl. btw − landedCost). Definities in `.claude/rules/geld.md`. **Wat
er in `landedCost` zit is D-16**; tot die beslissing is `landedCost =
supplierCost` een benoemde aanname, en dan is de ondergrens hieronder te laag
als er nog kosten bovenop komen.

## De prijsopbouw, in volgorde

```text
  supplierCost van de gekozen aanbieding   (meestal excl. btw — meten, LEVERANCIER §6)
+ prijsregel: opslag van de eigenaar       ← of: adviesprijs van de leverancier
+ btw
= de prijs die op de pagina staat          ← basis voor de prijsgeschiedenis
− kortingsactie                            ← begrensd door de ondergrens
= de prijs die de klant ziet
− kortingscode                             ← over de bestelling, verdeeld over de regels
+ verzendkosten                            ← btw volgens D-15
= wat er betaald wordt                     ← bevroren in de order-snapshot
```

**Elke stap heeft één bron en één moment.** Een korting die ergens anders wordt
toegepast dan hier, rekent bij het afrekenen een ander bedrag uit dan de pagina
toonde — en dat is de fout waar klanten over bellen.

---

## 1. Prijsregels (de opslag)

De eigenaar bepaalt zijn marge, per groep. Drie dingen liggen vast:

- **De sleutel waar een prijsregel aan hangt moet overal gelijk zijn.** Hangt
  hij aan de categorie, en komt een artikel via het zoekveld binnen zonder
  categorie, dan rekent de kassa iets anders uit dan de pagina toonde. Kies een
  sleutel die op het artikel zelf zit.
- **Geen prijsregel betekent: de adviesprijs van de leverancier**, zoals die
  binnenkomt. Geen opslag eroverheen, geen ondergrens eroverheen.
- **Geen van beide** betekent: inkoop plus een minimummarge uit de instellingen.
  Dat is een noodgreep, geen strategie.

Eén grens geldt altijd: **nooit onder de ondergrens verkopen** — de kostprijs
(`landedCost`, D-16) plus btw — ook niet als er 0 of onzin is ingevuld. Een
opslag buiten het geldige bereik (bijv. negatief of > 1000%) wordt geweigerd.

---

## 2. Kortingsacties

Een actie wijst een **groep** aan met een percentage en een looptijd. Niet een
lijst artikelen: "15% op categorie X" is één rij, geen tweehonderd.

### De ondergrens gaat vóór het percentage

Dit is de belangrijkste regel van dit document.

> **Een actie van 20% op een artikel met 10% opslag levert geen 20% korting op.
> Het wordt 9%.**

Want de korting mag de marge opeten en niet meer dan dat. Met een opslag van
10% is de ondergrens de kostprijs, en daar zit maar 9,1% tussen:

```text
kostprijs (hier = supplierCost)   € 10,00 excl. btw
+ 10% opslag                      € 11,00 excl. btw
+ 21% btw                         € 13,31   ← staat op de pagina
ondergrens (kostprijs + btw)      € 12,10
gevraagde korting 20%           → € 10,65   ligt onder de grens
toegepast                       → € 12,10   = 9% korting
```

**Begrenzen of weigeren?** Een gevraagd percentage dat zelf ongeldig is (0,
negatief, boven het maximum) wordt **geweigerd**. Een geldig percentage dat
bij één artikel op de ondergrens stuit wordt voor **dat artikel begrensd** — de
grens hangt per artikel van de kostprijs af en is bij het aanmaken van de
actie niet voor elk artikel te weten. Het paneel laat zien bij welke artikelen
dat gebeurt. Dit is geen uitzondering op "weigeren, niet afkappen"
(`.claude/rules/geld.md`): dat gaat over ongeldige invoer.

De maximale korting die een opslag toelaat is `opslag / (100 + opslag)`:

| Opslag | Maximale korting |
|---|---|
| 10% | 9,1% |
| 15% | 13,0% |
| 20% | 16,7% |
| 25% | 20,0% |
| 40% | 28,6% |
| 100% | 50,0% |

**Zonder prijsregel** is de ondergrens de minimummarge uit de instellingen, en
dan hangt de ruimte af van hoe hoog de adviesprijs van de leverancier boven de
inkoopprijs ligt. Die ruimte is meestal groter, en per artikel anders.

### Wat daaruit volgt voor de code en het scherm

- **Reken de korting uit waar de kostprijs nog in beeld is** — in de laag die
  de prijs opbouwt, niet ergens achteraf. Buiten die laag is de kostprijs weg
  en kun je de grens niet meer bewaken.
- **Geef terug wat er werkelijk is toegepast**, niet wat er gevraagd was.
- **Het beheerpaneel zegt het als de grens ingreep.** Anders staat er 20% in
  het paneel terwijl de klant 9% ziet, en denkt de eigenaar dat er iets stuk is.
- **De vlag op de kaart toont het toegepaste percentage**, naar beneden
  afgerond. Liever 9% tonen dan 10% beloven die de klant niet terugziet.
- Bij goedkope artikelen wiebelt dat percentage door afronding in hele centen:
  twee procent van € 1,11 is twee cent, en dat is 1,8% → er staat 1%. Dat is
  geen fout; het alternatief is een percentage tonen dat niet klopt met het
  bedrag.

### Twee acties op hetzelfde artikel

**De hoogste wint. Niet stapelen.** Twee kortingen over elkaar is voor niemand
na te rekenen, en de ondergrens zou het verschil toch opeten. Leg vast en toon
welke regel gewonnen heeft.

### Stoppen is niet weggooien

Een afgelopen actie blijft staan met een einddatum. Anders is over een half
jaar niet meer te verklaren waarom een oude bestelling die prijs had.

### De "van"-prijs

| Soort | Inhoud |
|---|---|
| `WETTELIJK` | Bij een aangekondigde prijsverlaging is de referentieprijs de laagste prijs die de handelaar in een periode van ten minste 30 dagen vóór de verlaging heeft toegepast. Bron: Richtlijn 98/6/EG art. 6 bis, ingevoegd door Richtlijn (EU) 2019/2161; in NL omgezet in het Besluit prijsaanduiding producten. Lidstaten kennen uitzonderingen (bijv. geleidelijke verlagingen, bederfelijke waar). **Laten bevestigen voor de markt van de winkel.** |
| `BELEID` | Geen doorgestreepte prijs zonder volledige geschiedenis over de hele referentieperiode; de uitleg ("laagste prijs van de afgelopen 30 dagen") staat erbij |
| Implementatie | `PriceHistory` (`docs/DATAMODEL.md`) met onze verkoopprijs, tijdstip, bron en markt; de referentieprijs wordt berekend over de periode vóór de start van de actie, niet vóór vandaag |

Wat daaruit volgt:

- **Prijzen meten en bewaren voordat een actie begint.** Een geschiedenis die je
  vandaag niet opbouwt heb je over dertig dagen nog steeds niet.
- Het gaat om **onze** verkoopprijs, niet de inkoopprijs van de leverancier.
- Meet ook artikelen van acties die **binnenkort beginnen**.
- Is er onvoldoende geschiedenis: alleen het percentage, geen doorgestreepte
  prijs.
- Een prijs moet achteraf te reconstrueren zijn: welke prijs gold op dag X,
  door welke regel. Dat is je bewijs als iemand ernaar vraagt.

---

## 3. Kortingscodes

Een code is iets anders dan een actie: hij geldt over de **bestelling**, niet
over een artikel.

| Eigenschap | Opmerking |
|---|---|
| Percentage | |
| Minimumbedrag | kijkt naar de artikelen, **niet** naar de verzendkosten |
| Looptijd | |
| Maximum aantal keer | optioneel |
| Eén keer per klant | hangt aan een unieke sleutel in de database |

### Drie regels die geld raken

1. **Een code geldt niet op artikelen die al in de actie zijn.** Anders stapelt
   hij alsnog bovenop een korting die de marge al heeft opgegeten. Reken de
   basis voor de code dus uit over de regels zónder eigen actie.
2. **"Eén keer per klant" hangt aan een unieke sleutel**, niet aan een controle
   in code. Tussen lezen en schrijven past een tweede tabblad.
3. **Afgetekend wordt er pas als er betaald is.** Een afgebroken bestelling mag
   de code niet verbruiken.

### De code en de gratis-verzendgrens

De drempel kijkt naar het bedrag **ná** de korting — met één uitzondering:

> **Een korting mag een bestelling nooit duurder maken.**

Een bestelling van € 100,00 met gratis verzending wordt met 5% korting € 95,00,
en dan vallen de verzendkosten er weer bij: € 95,00 + € 7,45 = € 102,45. De
klant betaalt méér door een korting te gebruiken. Vang dat af: zakt het totaal
door de korting onder de drempel terwijl het er zonder korting boven lag, dan
blijft de verzending gratis.

### Verdelen over de regels

Een code geldt over de bestelling, maar btw wordt per tarief berekend en een
retour gaat per regel. Daarom wordt het kortingsbedrag **verdeeld over de
regels waarop hij geldt**, voordat de btw wordt berekend:

- proportioneel naar het regeltotaal;
- de afrondingsrest deterministisch verdeeld (methode in D-15, bijv. grootste
  rest, bij gelijkstand de eerste regel);
- het aandeel staat in de bevroren regel (`allocatedOrderDiscountCents`).

Bij een **gedeeltelijk retour** gaat het aandeel van de geretourneerde regels
van het terugbetaalbedrag af. Zonder verdeling betaalt de winkel bij een retour
de korting dubbel terug, of de klant krijgt te weinig.

### Opnieuw keuren bij het afrekenen

De code wordt bij het afrekenen opnieuw gekeurd, met prijzen die de server zelf
heeft opgehaald. Wat de browser meestuurt is alleen de tekst van de code.

Is hij niet meer geldig, dan gaat de betaling **niet** door: de klant zag een
bedrag met korting en mag niet zonder waarschuwing het volle bedrag afrekenen.

---

## Rekenen: één functie, twee gebruikers

Het besteloverzicht in de browser en de server moeten hetzelfde bedrag
uitrekenen. Zet dat rekenwerk dus in een functie **zonder database eromheen**,
zodat beide kanten hem kunnen importeren zonder dat de browserbundel een
databasestuurprogramma binnentrekt.

---

## Nul, negatief en terugbetalen

- Een totaal van **nul** kan (bijv. vervanging); de betaalstap volgt dan een
  expliciete transitie (`docs/STATE_MACHINES.md`), geen betaling van € 0,00.
- Een totaal onder nul bestaat niet: een code wordt begrensd tot het bedrag
  waarop hij geldt.
- Een terugbetaling is nooit hoger dan wat er voor die regels betaald is,
  inclusief het verdeelde codeaandeel. Verzendkosten volgens `docs/RETOUREN.md`.

## Controlelijst

- [ ] Een actie die de ondergrens raakt wordt per artikel begrensd — en het
      paneel zegt het
- [ ] Een gevraagd percentage buiten bereik wordt wél geweigerd
- [ ] De ondergrens gebruikt de kostprijs volgens D-16
- [ ] Een code is verdeeld over de regels; btw klopt per tarief
- [ ] Een gedeeltelijk retour betaalt het juiste deel van de code terug
- [ ] Twee acties op één artikel: de hoogste wint, en dat is zichtbaar
- [ ] Geen doorgestreepte prijs zonder 30 dagen geschiedenis
- [ ] Een code werkt niet op artikelen die al in de actie zijn
- [ ] Een code maakt een bestelling nooit duurder
- [ ] De code wordt bij het afrekenen opnieuw gekeurd
- [ ] Pagina, winkelwagen en afrekenscherm tonen hetzelfde bedrag
