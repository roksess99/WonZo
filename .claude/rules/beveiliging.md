---
paths:
  - "src/lib/admin/**"
  - "src/**/admin/**"
  - "src/app/api/**"
  - "src/lib/payments/**"
  - "src/lib/checkout/**"
  - "src/lib/returns/**"
  - "src/middleware.ts"
  - "src/proxy.ts"
---

# Beveiliging — authenticatie, autorisatie en alles wat van buiten komt

Laadt bij werk aan het beheerpaneel, API-routes, webhooks, checkout en
publieke formulieren. Het dreigingsmodel staat in `docs/THREAT_MODEL.md`.

## Grondregels

1. **Alles van buiten is onbetrouwbaar tot het gekeurd is**: formulier,
   querystring, cookie, localStorage-winkelwagen, webhook, leverancierantwoord,
   upload. Keuren aan de rand, met een schema; daarbinnen getypeerd.
2. **UI hiding is not authorization.** Een verborgen knop beschermt niets.
   Elke handeling controleert server-side: wie is dit, mag deze rol dit, en
   hoort dit object bij deze gebruiker.
3. **Deny by default.** Een nieuwe route of server-actie is dicht tot er een
   expliciete rechtencontrole op zit.

## Authenticatie (beheer)

- **Wachtwoorden** met een trage, gezoute hash: `scrypt` (in de
  standaardbibliotheek, geen native module nodig) of Argon2id. Parameters
  vastleggen en kunnen ophogen; bij inloggen opnieuw hashen als ze verouderd
  zijn. Minimaal 12 tekens, controle tegen een lijst gelekte wachtwoorden waar
  mogelijk, geen samenstellingsregels.
- **MFA verplicht** voor elk beheeraccount (TOTP). Mailadres, wachtwoord én
  code in **één** formulier: geen half-ingelogde toestand die je moet bewaken.
  Het TOTP-geheim staat **versleuteld** in de database met een sleutel uit de
  omgeving; een gebruikte code wordt binnen zijn tijdvenster geweigerd
  (geen replay).
- **Herstelcodes**: bij het instellen eenmalig getoond, gehasht opgeslagen,
  elk één keer bruikbaar, gebruik komt in het auditlog en in een mail aan de
  beheerder.
- **Eén melding voor elke misser** ("combinatie onjuist"), en dezelfde
  responstijd: geen oracle voor bestaande accounts.
- **Brute force**: limiet per account én per IP, met oplopende vertraging.
  Blokkeer niet permanent op account (dat is een DoS-knop voor aanvallers).
- **De eerste beheerder** via een opzetpagina die zichzelf sluit zodra er één
  bestaat (afgedwongen in de database, niet met een vlag in code). Daarna
  uitnodigingen met een eenmalige, verlopende token.

## Sessies

- In de database, zodat ze in te trekken zijn. Cookie `HttpOnly`, `Secure`,
  `SameSite=Lax` of `Strict`, met `__Host-`-prefix waar mogelijk.
- Sessie-id is willekeurig (≥ 128 bit) en wordt **gehasht** opgeslagen.
- Nieuwe sessie-id bij inloggen en bij elke rechtenwijziging (geen session
  fixation). Uitloggen verwijdert de rij, niet alleen de cookie.
- Inactiviteitstimeout én absolute maximale duur; waarden in DECISIONS (D-07).
- Verlopen sessies opruimen in de dagelijkse taak — en controleren dat die
  taak de functie echt aanroept.

## Autorisatie

- Rechten **per onderdeel** (bestellingen bekijken, prijzen wijzigen,
  terugbetalen, beheerders beheren), ook met één beheerder.
- **IDOR**: elk object dat met een id wordt opgehaald, wordt opgehaald *binnen*
  de scope van de gebruiker (`WHERE id = ? AND owner = ?`), niet eerst
  opgehaald en dan vergeleken. Publieke toegang tot een bestelling, factuur of
  retour gaat met een token, nooit met alleen een nummer.
- **Test per handeling drie gevallen** (`docs/TESTEN.md`):

  | Geval | Verwacht |
  |---|---|
  | niet ingelogd | 401 of redirect naar inloggen; geen data, geen bijwerking |
  | ingelogd, verkeerde rol of ander object | 403 (of 404 om bestaan niet te verraden); geen bijwerking |
  | bevoegd | de handeling slaagt, met auditregel |

## Destructieve en financiële handelingen

Terugbetalen, annuleren, prijzen wijzigen, beheerder verwijderen, data wissen:

1. Expliciete autorisatie voor precies dit recht.
2. Het exacte doel (welk object) en bij geld het exacte bedrag en de valuta,
   **server-side herberekend** — nooit het bedrag uit de browser vertrouwen.
3. Een bevestigingsstap die het doel en bedrag letterlijk toont.
4. Een reden, waar die later iets verklaart (terugbetaling, afwijzing,
   verbergen van een beoordeling).
5. Een auditregel: wie, wat, wanneer, op welk object, oude en nieuwe waarde.
6. Een idempotentiesleutel (`docs/IDEMPOTENCY.md`).
7. Controle van de status van het object vóór de handeling
   (`docs/STATE_MACHINES.md`).

## Auditlog

- Alles wat geld, prijzen, zichtbaarheid, rechten of persoonsgegevens raakt.
- **Alleen toevoegen**: geen update of delete vanuit de applicatie.
- Zichtbaar in het paneel. Geen secrets of volledige persoonsgegevens erin;
  verwijs naar het object.

## Webverzoeken

- **CSRF**: elke state-wijzigende request via POST/PUT/PATCH/DELETE, met
  `SameSite`-cookies én een CSRF-token of een `Origin`-controle. Nooit een
  wijziging via GET.
- **XSS**: laat de templating escapen; geen `dangerouslySetInnerHTML` of
  equivalent met data van buiten. Leveranciertekst is ook "van buiten". Mail-
  HTML ontsmet elke waarde.
- **Injection**: alleen geparametriseerde queries of een querybuilder. Geen
  stringconcatenatie van SQL, ook niet voor sorteervelden (allowlist).
- **Open redirects**: een `returnTo`/`next`-parameter alleen als relatief pad
  binnen de site, of tegen een allowlist.
- **SSRF**: de server haalt nooit een URL op die uit invoer komt. Waar dat
  moet (afbeeldingen van de leverancier): allowlist van hosts, geen redirects
  naar andere hosts, geen privé-IP-bereiken, timeout en maximale grootte.
- **Rate limiting** op inloggen, wachtwoordherstel, checkout, kortingscodes,
  retouraanvraag, contact en alles wat mail verstuurt of een externe call
  doet. De opslag van de limiet staat niet in het geheugen van één proces als
  er meerdere processen zijn.
- **Bestandsuploads** (alleen waar nodig): grootte-limiet, type controleren op
  inhoud (magic bytes), nieuwe willekeurige naam, opslag buiten de webroot,
  serveren met `Content-Disposition: attachment` en een eigen content-type.
- Honeypot-veld kost de klant niets (`AANNAME`: werkt beter dan een captcha —
  niet gemeten; meet het als misbruik optreedt).

## Webhooks

- **Verifieer de afzender**: handtekening (HMAC, constante-tijdvergelijking,
  tijdstempel binnen een venster), of — als de provider geen handtekening
  biedt — behandel de webhook alleen als "er is iets veranderd" en **haal de
  status zelf op** bij de provider.
- **Geloof nooit bedrag of status uit de body**; vergelijk met wat de provider
  op een server-side opvraging zegt en met je eigen snapshot.
- **Dedupliceer** op het event-id van de provider (unieke sleutel).
- Antwoord snel; zwaar werk via de outbox. Een tijdelijke fout: non-2xx, zodat
  de provider opnieuw probeert.

## Geplande taken

Een cron-URL is voor de buitenwereld een gewone URL: bearer-token in de
header, vergelijken in constante tijd. De taak claimt zichzelf in de database
(lease met verlooptijd), zodat twee aanroepen niet dubbel werken.

## Headers en CSP

| Header | Waarde / doel |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` zodra HTTPS overal werkt |
| `Content-Security-Policy` | zie hieronder |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Frame-Options` / `frame-ancestors` | `DENY` / `'none'` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Permissions-Policy` | camera, microfoon, geolocatie uit |

**CSP** is een eigen klus: nonce per verzoek voor scripts, `object-src 'none'`,
`base-uri 'self'`, `form-action` beperkt tot de eigen site en de betaaldienst.
Eerst `Content-Security-Policy-Report-Only`, meten, dan afdwingen. Verkeerd
ingesteld breekt hij de checkout stil — dus met een E2E-test erop.

## Secrets

- `.env` niet in Git en niet leesbaar voor Claude (hooks). `.env.example` wel —
  daar alleen namen, nooit waarden.
- **Een sleutel die ooit in een commit stond is gelekt.** Roteren, niet alleen
  verwijderen.
- Nooit een secret in een logregel, foutmelding, URL of clientbundel. Variabelen
  met een publiek prefix (framework-afhankelijk) zijn publiek.
- Testsleutels lokaal; een live sleutel op een ontwikkelmachine maakt van
  "even testen" een transactie.
- Valideer bij opstart dat alle vereiste variabelen er zijn en de juiste vorm
  hebben; start anders niet.

## Persoonsgegevens en logging

- Niet in een URL en niet in een logregel. Log id's, geen mailadressen,
  adressen, tokens of betaalgegevens. Details: `docs/OBSERVABILITY.md`.
- Nieuwe kolom met een persoonsgegeven → regel in `docs/PRIVACY.md`.

## Afhankelijkheden

- `pnpm audit` schoon zodra je `package.json` aanraakt; lockfile altijd mee
  committen; installeren met `--frozen-lockfile` in CI.
- Geen library zonder te vragen (afgedwongen met een `ask`-regel).
- Een kwetsbaarheid diep in de boom zonder opwaardering: override binnen
  hetzelfde hoofdnummer, met commentaar waarom en wanneer hij weg kan.
- Geen `curl … | sh`; installatiescripts van pakketten zo veel mogelijk
  uitgeschakeld (`GEDOCUMENTEERD`: pnpm 10+ draait ze alleen voor pakketten
  die expliciet zijn toegestaan — controleer de versie die je gebruikt).
