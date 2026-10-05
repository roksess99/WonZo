# Observability

Doel: een checkout- of betaalincident **end-to-end kunnen volgen** zonder te
raden, en een storing zien vóór de klant belt. Tooling (logopslag, error
tracking, uptime-monitor) is D-18.

---

## Gestructureerde logs

Eén JSON-object per regel, met vaste velden:

| Veld | Altijd | Opmerking |
|---|---|---|
| `ts` | ja | UTC, ISO 8601 |
| `level` | ja | `debug`/`info`/`warn`/`error` |
| `msg` | ja | korte, vaste tekst — geen variabelen erin geplakt |
| `requestId` | ja | per inkomend verzoek, of overgenomen uit een vertrouwde proxyheader |
| `correlationId` | waar van toepassing | volgt één bedrijfsproces over verzoeken, jobs en webhooks heen (= `orderId` voor alles rond een bestelling) |
| `orderId`, `paymentId`, `refundId`, `returnId`, `supplierOrderId` | waar van toepassing | |
| `providerPaymentId`, `providerEventId` | waar van toepassing | |
| `supplierRequestId` | waar van toepassing | id dat de leverancier teruggeeft, of ons eigen id dat we meesturen |
| `jobName`, `jobRunId` | in geplande taken | |
| `actor` | bij beheerhandelingen | id, geen naam of mailadres |
| `durationMs`, `status` | bij calls | |
| `errorKind`, `err` | bij fouten | foutsoort uit `docs/SUPPLIER_RESILIENCE.md`; stacktrace alleen server-side |

## Wat er nooit in een log komt

Wachtwoorden, tokens, sessie-id's, API-sleutels, volledige webhook-bodies,
kaart- of rekeninggegevens, mailadressen, namen, adressen, telefoonnummers.
Log het **id** van het object. Een redactiefunctie in de logger maskeert
bekende veldnamen (`password`, `token`, `authorization`, `email`, `address`,
`iban`, …) als vangnet — niet als vervanging van niet-loggen.

## Een incident volgen

```text
request            requestId=r1                          POST /checkout
  → order          correlationId=o1 orderId=o1           PENDING_PAYMENT
  → payment        orderId=o1 paymentId=p1               CREATED → PENDING (providerPaymentId=pp1)
  → webhook        requestId=r2 providerEventId=e1       verified, paymentId=p1
                   orderId=o1                            PAID
  → outbox         orderId=o1 jobRunId=j1                confirmation mail sent
  → supplier order orderId=o1 supplierOrderId=s1         PLACED (supplierRequestId=x1)
```

Zoeken op `orderId=o1` (of `correlationId`) geeft de hele keten. Daarom:

- de `orderId` gaat als metadata mee naar de betaaldienst en waar mogelijk
  naar de leverancier;
- webhook-handlers zoeken eerst de `paymentId`/`orderId` op en loggen die;
- outbox-records en jobs dragen de `correlationId` van wat ze veroorzaakte.

De statuslog (`*_events`) in de database is de tweede bron: wie, wat,
wanneer, via welke bron.

## Error tracking

- Elke onverwachte fout naar de error tracker, met `requestId`,
  `correlationId`, release-versie en omgeving — zonder persoonsgegevens.
- Fouten groeperen per soort; een nieuwe soort na een release is een signaal.
- Verwachte fouten (validatie, 404, ongeldige code) zijn geen errors maar
  `info`/`warn` met een teller.

## Metrics

| Metric | Waarom |
|---|---|
| Checkouts gestart / orders `PENDING_PAYMENT` / `PAID` | conversie en waar het stokt |
| Payments per status; tijd tot `PAID` | betaaldienst- of webhookproblemen |
| Webhooks: ontvangen, ongeldig, dubbel, verwerkingstijd | vervalsing, provider-retries |
| Reconciliatie: correcties, mismatches | gemiste webhooks, bugs |
| Outbox: wachtrij, leeftijd oudste, mislukte pogingen | mail die blijft hangen |
| Leverancier: calls, p50/p95, fouten per soort, breakerstatus, cache-hitrate | storing, rate limit |
| Orders in `FULFILLMENT_PENDING` ouder dan X | inkoop blijft liggen |
| Inkooporders `UNKNOWN`/`REJECTED` | automatische inkoop vastgelopen; een mens moet beslissen (D-04) |
| Tegoed bij de leverancier | te weinig tegoed laat de inkoop mislukken |
| Logins mislukt, herstelcodegebruik | aanval op beheer |
| HTTP 5xx-percentage, latentie | algemene gezondheid |

## Health checks

| Endpoint | Controleert | Gebruikt door |
|---|---|---|
| `/healthz` (liveness) | proces leeft — geen afhankelijkheden | platform/herstart |
| `/readyz` (readiness) | database bereikbaar, migratiestand klopt, vereiste config aanwezig | load balancer, deploy |

Niet in de health check: de leverancier of de betaaldienst. Een storing daar
mag de winkel niet uit de load balancer halen; dat meet je met metrics en
alerts. Health-endpoints tonen geen versies van dependencies of interne
details.

## Alerts

Een alert heeft een eigenaar en een actie. Een alert waar niets op volgt
wordt uitgezet of veranderd.

| Alert | Drempel (startwaarde, `BELEID`) | Actie |
|---|---|---|
| Betaald na verloop / bedrag-mismatch | elk geval | beheerder beslist (`docs/PAYMENTS.md`) |
| Som refunds > betaald | elk geval | incident |
| Webhooks met ongeldige handtekening | > 10 in 5 min | mogelijk aanval; controleren |
| Geen enkele `PAID` in N uur tijdens openingstijd | afhankelijk van volume | checkout of webhook kapot? |
| Outbox oudste > 15 min | — | mailprovider of worker |
| Leverancier-breaker open | > 10 min | storing bij leverancier; status melden |
| Leverancier `AUTH` | elk geval | token vernieuwen |
| 5xx-percentage | > 2 % over 5 min | rollback overwegen |
| `/readyz` faalt | 2 opeenvolgende checks | database/deploy |
| Backup mislukt of niet gedraaid | elk geval | `docs/DISASTER_RECOVERY.md` |
| Herstelcode gebruikt / login nieuw apparaat | elk geval | bevestigen bij de beheerder |
| Inkooporder `REJECTED` of `UNKNOWN` | elk geval | de klant heeft betaald en wacht; `docs/BEHEER.md` § Dashboard |
| Tegoed bij de leverancier onder drempel | drempel: keuze van de eigenaar | opwaarderen vóór de volgende inkoop mislukt |
