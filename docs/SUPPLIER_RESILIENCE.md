# Leverancier — veerkracht, faalgedrag en fixtures

De leverancier-API is niet in onze hand. Dit document legt vast hoe de winkel
zich gedraagt als die API traag, kapot, overbelast of onbereikbaar is. Getallen
hieronder zijn **startwaarden** (`BELEID`); vervang ze door gemeten waarden uit
`docs/api/LEVERANCIER.md` zodra die er zijn.

Normatieve regels voor de adapter: `.claude/rules/catalogus.md`.

---

## Mechanismen in de HTTP-client

| Mechanisme | Startwaarde | Waarom |
|---|---|---|
| **Timeout** | connect 2 s, totaal 8 s (lezen); 15 s (inkooporder) | Een hangende call houdt een serverproces vast |
| **Retry** | max. 2 extra pogingen, **alleen** voor idempotente reads en alleen bij netwerkfout, 429, 502, 503, 504 | Een retry op een schrijfactie is een tweede bestelling |
| **Exponentiële backoff** | 250 ms × 2ⁿ, max. 4 s | Geen storm op een herstellende server |
| **Jitter** | volledige jitter (willekeurig 0..backoff) | Voorkomt dat alle processen tegelijk opnieuw proberen |
| **`Retry-After`** | respecteren als de leverancier hem stuurt | |
| **Rate limit (client-side)** | token bucket onder de gemeten limiet (bijv. 80 %) | De limiet geldt voor de hele winkel |
| **Concurrency-limiet** | max. N gelijktijdige calls per proces (start: 4) | `EERDER WAARGENOMEN`: twee gelijktijdige gepagineerde calls gaven één HTTP 500 |
| **Circuit breaker** | open na 5 opeenvolgende fouten of > 50 % fouten in 30 s; half-open na 30 s met één proefcall | Tijdens een storing niet blijven hameren |
| **Cache** | per soort, zie `.claude/rules/catalogus.md` | |
| **Stale-beleid** | weergave mag data tot 24 uur oud tonen als de breaker open staat; **checkout nooit** | Liever een iets oude catalogus dan een lege winkel; nooit afrekenen op oude prijzen |

**Retry-budget:** tijdens een storing (breaker open) wordt er **niet**
opnieuw geprobeerd; de call faalt direct. Er blijft dus geen verkeer naar een
leverancier die al plat ligt.

## Foutclassificatie

Elke fout uit de adapter krijgt één van deze soorten, zodat de lagen erboven
kunnen beslissen zonder leverancierskennis:

| Soort | Voorbeelden | Opnieuw proberen? |
|---|---|---|
| `TIMEOUT` | geen antwoord binnen de limiet | read: ja (binnen budget); write: **nee** → `UNKNOWN` |
| `RATE_LIMITED` | 429, of foutcode in een 200-antwoord | na `Retry-After` / backoff |
| `UNAVAILABLE` | 5xx, DNS, verbinding geweigerd, breaker open | read: ja (binnen budget) |
| `INVALID_RESPONSE` | schema faalt, HTML in plaats van JSON | nee — loggen en tellen |
| `NOT_FOUND` | artikel bestaat niet (meer) | nee |
| `REJECTED` | leverancier weigert een bestelling (voorraad, prijs, adres) | nee |
| `AUTH` | 401/403, token verlopen | nee — alert |

## Gedrag per soort storing

| Storing | UI | Checkout | Retry | Beheer | Herstel |
|---|---|---|---|---|---|
| **Catalogus lezen** (lijst/categorie) | Gecachete of stale lijst; anders een eerlijke lege staat met uitleg. Geen foutpagina | n.v.t. | read-retry binnen budget; breaker | Teller + alert bij aanhoudend | Vanzelf als de breaker sluit |
| **Prijs** | Artikel zonder geldige prijs wordt niet als koopbaar getoond ("prijs tijdelijk niet beschikbaar") | **Blokkeert** de regel: geen prijs = niet afrekenen | read-retry | Alert als het veel artikelen raakt | — |
| **Voorraad** | Toont "beschikbaarheid onbekend"; niet "op voorraad" | **Blokkeert** tenzij D-22 "bestellen bij onbekende voorraad" toestaat | read-retry | — | — |
| **Checkout** (verse prijs/voorraad bij het afrekenen) | Duidelijke melding, winkelwagen blijft bewaard | Geen order, geen betaling | read-retry binnen 8 s totaal | Teller | Klant probeert opnieuw |
| **Inkooporder plaatsen** | n.v.t. (klant heeft al betaald) | n.v.t. | **Geen automatische retry**; `TIMEOUT` → inkooporder `UNKNOWN` | Melding "inkoop onbekend" | Reconciliatie vraagt de stand op bij de leverancier op de eigen referentie; lukt dat niet, dan bevestigt de beheerder `PLACED` of `REJECTED` (`docs/STATE_MACHINES.md`) |
| **Token verlopen** (`AUTH`) | Zoals "catalogus lezen" | Zoals "checkout" | nee | **Directe alert** | Token vernieuwen |

**De grens:** een kapot onderdeel van de leverancier mag geen foutpagina
opleveren — maar een fout in het **geldpad** (prijs, voorraad bij afrekenen,
inkoop) is luid en houdt de handeling tegen. Het verschil is of de klant of de
winkel er geld aan kwijt kan raken.

---

## Fixtures en mock

De mock en de testfixtures zijn één set, onder `src/lib/catalog/fixtures/`
(de mock draait ook in productie zonder token, dus de set hoort bij de
applicatiecode; tests importeren hem daarvandaan, D-30), en zijn:

- **deterministisch** — vaste id's, prijzen en datums; geen `Math.random`,
  geen `Date.now`;
- **reproduceerbaar** — dezelfde invoer geeft hetzelfde antwoord, ook in CI;
- **schema-valide** — ze gaan door dezelfde validatie als echte antwoorden,
  behalve de fixtures die juist ongeldig moeten zijn;
- **in de vorm van de leverancier** (DTO), zodat de mapping meegetest wordt.

| Fixture | Wat het test |
|---|---|
| `valid-product` | Het normale geval, met meerdere aanbiedingen; de goedkoopste mét voorraad wint |
| `no-image` | Plaatshouder in plaats van een gebroken afbeelding |
| `out-of-stock` | Niet koopbaar; geen prijs van een lege verkoper |
| `price-changed` | Prijs bij het afrekenen wijkt af van de winkelwagen → klant ziet het vóór betalen |
| `string-numbers` | Bedragen en voorraad als string; exacte conversie naar centen |
| `long-name` | Opmaak met een extreem lange naam en speciale tekens |
| `malformed-product` | Faalt het schema → overgeslagen in lijsten, harde fout in de checkout |
| `error-in-200` | Foutcode in een 200-antwoord wordt als fout herkend |
| `supplier-timeout` | Client geeft `TIMEOUT` na de limiet (gesimuleerde vertraging, geen echte wachttijd in tests) |
| `rate-limited` | 429 met `Retry-After` |
| `unavailable` | 503, en de breaker opent na de drempel |
| `auth-expired` | 401 → `AUTH`, alert |
| `order-rejected` | Inkooporder geweigerd → `REJECTED` |
| `order-timeout` | Inkooporder zonder antwoord → `UNKNOWN`, geen retry |

In ontwikkeling kies je een scenario met een omgevingsvariabele (bijv.
`CATALOG_MOCK_SCENARIO=unavailable`), zodat de faaltoestanden ook in de
browser te bekijken zijn.

## Meten

Per soort call: aantal, latentie (p50/p95), fouten per soort, staat van de
breaker, cache-hitrate. Zie `docs/OBSERVABILITY.md`. Een meting van de echte
limieten hoort in `docs/api/LEVERANCIER.md` met `GEMETEN` en een datum.
