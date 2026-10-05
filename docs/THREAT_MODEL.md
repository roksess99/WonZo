# Dreigingsmodel

Praktisch en generiek: geen leverancier of hostingpartij aangenomen. Herzien bij
elke nieuwe koppeling, elk nieuw soort gebruiker en vóór livegang. Regels:
`.claude/rules/beveiliging.md`. Herstel bij incidenten:
`docs/DISASTER_RECOVERY.md`.

**Aanvallers die we aannemen:** een anonieme bezoeker met een script; een klant
die zijn eigen winkelwagen of verzoeken manipuleert; iemand met een gelekt
wachtwoord of token; een vervalste webhook; een gecompromitteerde dependency;
een fout van een beheerder of van Claude zelf.

**Buiten scope (bewust):** een aanvaller met root op de server of in het
hostingaccount (dan helpen alleen backups en rotatie), en nationale actoren.

---

| Asset | Dreiging | Aanvalsvector | Impact | Mitigatie | Detectie | Herstel |
|---|---|---|---|---|---|---|
| **Klantgegevens** | Inzage door onbevoegden | IDOR op order-/factuur-/retour-URL met raadbaar nummer | Datalek (meldplicht), reputatie | Token per object, gehasht opgeslagen; queries binnen scope; dezelfde melding bij elke misser | 404-pieken per IP; audit van publieke toegang | Tokens roteren; lek beoordelen en melden (`docs/PRIVACY.md`) |
| | Lek via logs of URL | Persoonsgegevens in querystring of logregel | Datalek | Geen PII in URL/logs; logredactie (`docs/OBSERVABILITY.md`) | Logscan in CI/review | Logs opschonen, retentie inkorten |
| | Diefstal van de database | SQL-injectie, gelekte databasecredentials, open firewall | Volledig lek | Geparametriseerde queries; firewall op IP; least-privilege databasegebruiker | Onverwachte queries/verbindingen | Credentials roteren; restore; melden |
| **Orders** | Order zonder betaling | Status zetten via terugkeer-URL of gemanipuleerd verzoek | Goederen weg zonder geld | Status alleen via geverifieerde provider-bron (`docs/PAYMENTS.md`) | Reconciliatie: lokaal `PAID` zonder provider-`paid` | Order on hold; inkoop tegenhouden |
| | Prijsmanipulatie | Bedrag/prijs in browser-payload of localStorage aanpassen | Verlies per order | Server herberekent alles; browser stuurt alleen id, aantal, codetekst | `AMOUNT_MISMATCH` op webhook | Order on hold, klant contacteren |
| | Dubbele orders | Dubbele klik, twee tabbladen | Dubbele inkoop | `checkoutAttemptId` uniek (`docs/IDEMPOTENCY.md`) | Twee orders zelfde klant/inhoud binnen minuten | Annuleren met terugbetaling |
| **Betaalstatus** | Vervalste webhook | POST naar de webhook-URL | Order als betaald | Handtekening verifiëren of status zelf opvragen; event-dedupe | Ongeldige handtekeningen tellen + alert | Events opnieuw verwerken via reconciliatie |
| | Divergentie provider ↔ lokaal | Gemiste webhook, crash na betaling | Klant betaald zonder order, of andersom | Intent-first-volgorde; reconciliatie | Dagelijkse afsluiting met verschillen | Transitiefunctie via reconciliatie; alert bij betaald-na-verloop |
| | Dubbele terugbetaling | Twee klikken, retry met nieuwe sleutel | Geldverlies | `refund.id` als sleutel; som ≤ betaald met vergrendelde rij | Som refunds > betaald (mag nooit) | Bij provider terugvorderen; incident |
| **Leveranciercredentials** | Diefstal of misbruik | Token in clientbundel, log, repo of `.env` gelezen door tooling | Kosten, ongeautoriseerde bestellingen op het tegoed bij de leverancier, rate limit op | Server-only; `.env` geblokkeerd voor Claude (hooks); secret scan in CI. Een aparte bestelsleutel kan niet: de leverancier kent één sleutel voor lezen én bestellen (`docs/api/LEVERANCIER.md`); het tegoed begrenst de schade | Bestellingen bij de leverancier zonder lokale inkooporder (dagelijkse vergelijking); tegoed daalt onverwacht | Roteren; bestellingen bij leverancier nagaan |
| **Automatisch inkopen** (D-04) | Inkoop zonder betaling, of twee keer | Bug in de flow, dubbel verwerkte webhook, tweede verzending na een timeout | Geld weg bij de leverancier; annuleren via de API kan niet | Inkoop alleen vanuit `PAID` via de transitiefunctie; eigen referentie = `supplierOrder.id`; nooit opnieuw versturen na `UNKNOWN` (`docs/IDEMPOTENCY.md`) | Dagelijkse vergelijking van bestellingen bij de leverancier met lokale inkooporders | Contact met de leverancier; retour; incident |
| **Beheeraccounts** | Overname | Credential stuffing, phishing, gestolen sessie | Volledige controle: prijzen, terugbetalingen, data | Trage hash, MFA verplicht, rate limiting, sessies intrekbaar, korte levensduur | Mislukte logins, login van nieuw land/apparaat, herstelcodegebruik → mail | Sessies intrekken, wachtwoord + MFA resetten, audit nalopen |
| | Misbruik door een bevoegde | Beheerder met te veel rechten | Fraude, fouten | Rechten per onderdeel; bevestiging + reden bij geld; append-only audit | Auditlog-review; terugbetalingen boven drempel → melding | Terugdraaien via audit; rechten aanpassen |
| **Factuurdocumenten** | Inzage | Raadbare factuur-URL | Datalek | Alleen via paneel of met token; nooit op nummer alleen | 404-pieken | Tokens roteren |
| | Wijziging of gat | Factuur achteraf aanpassen; nummer hergebruiken | Fiscaal probleem | Onwijzigbaar na uitgifte; creditnota; teller in transactie | Validatie: reeks zonder gaten (als D-21 dat eist) | Creditnota + nieuwe factuur |
| **Sessies** | Kaping | XSS steelt cookie; session fixation; CSRF | Acties namens beheerder | `HttpOnly`, `Secure`, `SameSite`, nieuwe id bij login, CSP, CSRF-token/Origin-check | Sessie gebruikt vanaf ander IP/UA (signaal, geen bewijs) | Alle sessies van de gebruiker intrekken |
| **Kortingscodes** | Raden / delen / stapelen | Brute force op codes; code meermaals in parallel gebruiken | Margeverlies | Rate limit op code-invoer; "één per klant" met unieke sleutel; ondergrens; verbruik bij `PAID` | Ongebruikelijk veel pogingen of gebruik per code | Code uitschakelen (niet verwijderen) |
| **Leverancier-API** | Uitputting van de rate limit | Bezoeker of bot triggert veel catalogus-calls | Winkel onbruikbaar voor iedereen | Server-side cache; rate limit per IP; concurrency-limiet; breaker | Rate-limitfouten van de leverancier | Breaker, stale data, bots blokkeren |
| | Kwaadaardige of kapotte data | XSS via productnaam; ongeldige prijs | XSS, verkeerde prijzen | Schema aan de rand; escapen bij weergave; prijs-sanity-check (bijv. > 0 en < plafond) | Schemafouten tellen | Artikel overslaan; cache leegmaken |
| | SSRF via afbeelding-URL's | Leverancier (of aanvaller via leverancier) levert interne URL | Toegang tot interne diensten | Allowlist van hosts; geen privé-IP's; geen redirects naar andere hosts | Geweigerde fetches loggen | — |
| **Webhooks** | Replay | Oud, geldig event opnieuw sturen | Dubbele verwerking | Dedupe op event-id; tijdstempelvenster; status opvragen bij de bron | Dubbele event-id's tellen | — (idempotent) |
| | DoS | Veel verzoeken naar de webhook-URL | Echte events lopen vertraging op | Snel weigeren bij ongeldige handtekening; rate limit; zwaar werk via outbox | Verzoekvolume | Reconciliatie vangt gemiste events |
| **Broncode en pipeline** | Supply chain | Gecompromitteerde dependency of install-script | Code-executie op build en server | Lockfile, `--frozen-lockfile`, `pnpm audit`, install-scripts beperkt, review van nieuwe dependencies (`ask`-regel) | Audit in CI | Versie terugzetten; secrets roteren |
| | Secret in Git | Commit van `.env` of sleutel in code | Gelekte sleutel | `.gitignore`, hook blokkeert `git add .env`, `git add -f` en sleutels in inhoud; secret scan in CI | Secret scan | Roteren (verwijderen uit de geschiedenis is niet genoeg) |
| | Destructieve actie door agent | Force push, `reset --hard`, productie-deploy door Claude | Werk of data kwijt | `deny`-regels en guard-hook (`docs/CLAUDE_CODE.md`); branch protection | Hook-blokkades in de sessie | Reflog / remote / backup |

---

## Bijwerken

Elke nieuwe koppeling, elk nieuw publiek formulier en elke nieuwe rol: één rij
erbij of een bestaande rij aanpassen, in dezelfde PR als de code.
