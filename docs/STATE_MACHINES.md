# State machines

Autoriteit: domeininvariant (4). Elke statuswijziging in de code gaat via een
transitie uit dit document. Een transitie die hier niet staat, bestaat niet.

---

## Gemeenschappelijke regels

- **Eén transitiefunctie per machine**, met een tabel van toegestane
  `(from, to)`-paren. Geen `status = …` elders in de code.
- **Compare-and-set**: `UPDATE … WHERE id = ? AND status = :from`. Nul rijen =
  iemand anders was eerst → opnieuw lezen, niet stil doorgaan.
- **Event-log**: elke transitie schrijft een rij in een append-only
  `*_events`-tabel (van, naar, actor, bron, tijd, reden) in dezelfde transactie.
- **Neveneffecten via de outbox**, in dezelfde transactie geschreven. Nooit een
  mail of externe call binnen de transactie.
- **Idempotent**: een transitie naar de status waarin het object al staat, met
  dezelfde bron-sleutel, is een no-op en geen fout.
- **Actoren**: `customer`, `admin` (met recht), `system` (geplande taak),
  `provider` (geverifieerde webhook of opvraging), `reconciliation`.
- Terminale statussen hebben geen uitgaande transities.

---

## Order

De order beschrijft de **levenscyclus van de koop**. Retour- en
terugbetaalstatus zijn **afgeleid** van de Return- en Refund-records en worden
niet als orderstatus opgeslagen: één order kan meerdere retouren en
terugbetalingen hebben, en een tweede opgeslagen status zou kunnen afwijken van
de records waaruit hij volgt.

Er is geen `DRAFT`: de winkelwagen in de browser is het concept. Een order
ontstaat pas als de klant op "Bestellen en betalen" drukt.

### Statussen

| Status | Betekenis | Terminaal |
|---|---|---|
| `PENDING_PAYMENT` | Order en snapshot bestaan; er loopt (of komt) een betaalpoging | nee |
| `PAYMENT_FAILED` | De laatste betaalpoging is mislukt of afgebroken; opnieuw proberen kan | nee |
| `CANCELLED` | Gaat niet door: verlopen, door de klant afgebroken, of geannuleerd met volledige terugbetaling | ja |
| `PAID` | Betaling bevestigd door de provider; binnen het annuleringsvenster of wacht op controle (D-04) | nee |
| `FULFILLMENT_PENDING` | Vrijgegeven om in te kopen | nee |
| `PURCHASED` | Alle inkooporders geplaatst | nee |
| `PARTIALLY_FULFILLED` | Een deel is verzonden, of één van meerdere inkooporders is mislukt | nee |
| `SHIPPED` | Alles is onderweg | nee |
| `DELIVERED` | Alles is afgeleverd (of als afgeleverd aangemerkt) | nee |
| `COMPLETED` | Afgeleverd, retourtermijn voorbij, geen open retour | ja |

Afgeleid (niet opgeslagen): `RETURN_REQUESTED` (er is een open retour),
`PARTIALLY_RETURNED`, `PARTIALLY_REFUNDED`, `REFUNDED` (som van geslaagde
refunds = betaald bedrag).

Daarnaast een **hold-vlag** (`holdReason`, bijv. `AMOUNT_MISMATCH`,
`FRAUD_REVIEW`): zolang die gezet is, zijn transities vanaf `PAID` geblokkeerd.

### Transities

| Van | Naar | Actor | Voorwaarde | Neveneffecten |
|---|---|---|---|---|
| — | `PENDING_PAYMENT` | customer | server-side quote geldig, voorraad gecontroleerd | snapshot bevriezen; payment `CREATED` |
| `PENDING_PAYMENT` | `PAID` | provider / reconciliation | payment `PAID`, bedrag en valuta = snapshot | outbox: bevestiging, factuur, melding beheerder; codegebruik vastleggen |
| `PENDING_PAYMENT` | `PAYMENT_FAILED` | provider / reconciliation | laatste payment `FAILED`/`CANCELED`/`EXPIRED` | — |
| `PAYMENT_FAILED` | `PENDING_PAYMENT` | customer | nieuwe betaalpoging, snapshot nog geldig (anders nieuwe quote) | nieuwe payment `CREATED` |
| `PENDING_PAYMENT`, `PAYMENT_FAILED` | `CANCELLED` | system / customer | snapshot verlopen of klant breekt af, **en** provider bevestigt dat geen payment geslaagd is | reservering vrijgeven |
| `PENDING_PAYMENT` | `PAID` (bedrag 0) | system | totaal is exact 0 en D-05 staat dit toe | als bij `PAID` |
| `PAID` | `FULFILLMENT_PENDING` | admin / system | geen hold; bij WonZo direct, want inkopen gaat automatisch (D-04 — of er een korte wachttijd komt is nog open) | — |
| `PAID`, `FULFILLMENT_PENDING` | `CANCELLED` | admin | refund voor het volledige bedrag in dezelfde transactie `REQUESTED` | refund-flow; creditnota bij `SUCCEEDED`; mail |
| `FULFILLMENT_PENDING` | `PURCHASED` | admin / system | alle inkooporders `PLACED` | mail optioneel |
| `FULFILLMENT_PENDING`, `PURCHASED` | `PARTIALLY_FULFILLED` | admin / system | één inkooporder `REJECTED` of deels verzonden | alert; beheerder kiest: vervangen of deel terugbetalen |
| `PURCHASED`, `PARTIALLY_FULFILLED` | `SHIPPED` | admin / provider | alle inkooporders verzonden | mail "onderweg" |
| `SHIPPED` | `DELIVERED` | admin / provider / system | afgeleverd gemeld, of N dagen na verzending (D-13) | — |
| `DELIVERED` | `COMPLETED` | system | retourtermijn voorbij, geen open retour | — |

### Verboden (voorbeelden die in tests horen)

- `PENDING_PAYMENT → FULFILLMENT_PENDING` (overslaan van de betaling)
- `PAID → PENDING_PAYMENT` (terug naar onbetaald; ook niet bij een laat
  "pending"-event)
- `CANCELLED → *` en `COMPLETED → *`
- `PURCHASED → CANCELLED` zonder dat de inkooporders geannuleerd zijn
- Elke transitie naar `PAID` vanaf de terugkeer-URL zonder opvraging bij de
  provider

### Herstel

| Situatie | Herstel |
|---|---|
| Blijft in `PENDING_PAYMENT` | Reconciliatie (`docs/PAYMENTS.md`); daarna verloop → `CANCELLED` |
| Betaald na `CANCELLED` | Alert; beheerder heropent (nieuwe order met dezelfde snapshot) of betaalt terug. Nooit automatisch |
| Hold gezet | Beheerder lost op, haalt hold weg met reden (auditregel) |
| Blijft in `FULFILLMENT_PENDING` | Dashboardtegel "inkoop vastgelopen" (`docs/BEHEER.md`); alert na X minuten |

---

## Payment

Eén betaalpoging bij de provider. Naamgeving van providerstatussen verschilt;
de mapping staat bij D-05.

| Status | Betekenis | Terminaal |
|---|---|---|
| `CREATED` | Lokaal record, nog niet (bevestigd) bij de provider | nee |
| `PENDING` | Provider kent hem (`providerPaymentId`), klant is bezig | nee |
| `AUTHORIZED` | Gereserveerd, nog niet afgeschreven (alleen bij methodes met aparte capture) | nee |
| `UNKNOWN` | Call naar de provider gaf geen uitsluitsel (timeout) | nee |
| `PAID` | Geld ontvangen volgens de provider | nee (chargeback mogelijk) |
| `FAILED` / `CANCELED` / `EXPIRED` | Niet gelukt | ja |
| `CHARGED_BACK` | Teruggedraaid door bank of kaartmaatschappij | ja |

| Van | Naar | Actor | Voorwaarde / effect |
|---|---|---|---|
| — | `CREATED` | customer | sleutel = payment.id |
| `CREATED` | `PENDING` | system | provider-call geslaagd; `providerPaymentId` opslaan |
| `CREATED` | `UNKNOWN` | system | timeout of netwerkfout |
| `CREATED` | `PENDING` / `PAID` | provider / reconciliation | provider kent de payment al (crash vóór het opslaan van `providerPaymentId`, `docs/PAYMENTS.md` stap 5); stand bij de provider opgevraagd, `providerPaymentId` opslaan; bij `PAID` dezelfde bedragcontrole als hieronder |
| `UNKNOWN` | `PENDING` / `PAID` / `FAILED` | reconciliation | stand bij de provider opgevraagd |
| `PENDING` | `AUTHORIZED` | provider | — |
| `PENDING`, `AUTHORIZED` | `PAID` | provider / reconciliation | bedrag en valuta = snapshot, anders hold op de order |
| `CREATED`, `PENDING`, `AUTHORIZED` | `FAILED` / `CANCELED` / `EXPIRED` | provider / reconciliation | order → `PAYMENT_FAILED` als dit de laatste poging was |
| `PAID` | `CHARGED_BACK` | provider | alert, auditregel; order krijgt hold |

**Verboden:** `PAID → FAILED`, `FAILED → PAID` zonder nieuwe opvraging bij de
provider (een laat "paid"-event op een `FAILED` payment gaat via
reconciliatie en geeft een alert), elke transitie op basis van alleen de
webhook-body.

Terugbetalingen veranderen de payment-status niet; ze zijn eigen records.

---

## Refund

| Status | Betekenis | Terminaal |
|---|---|---|
| `REQUESTED` | Bedrag server-side bepaald en vastgelegd, sleutel = refund.id | nee |
| `SUBMITTED` | Provider heeft hem aangenomen (`providerRefundId`) | nee |
| `UNKNOWN` | Call gaf geen uitsluitsel | nee |
| `SUCCEEDED` | Provider meldt uitgevoerd | ja |
| `FAILED` | Provider weigerde of het mislukte | ja |

| Van | Naar | Actor | Voorwaarde / effect |
|---|---|---|---|
| — | `REQUESTED` | admin (recht "terugbetalen") | order/payment-status staat het toe; som(refunds niet `FAILED`) + bedrag ≤ betaald; reden; audit |
| `REQUESTED` | `SUBMITTED` | system | provider-call met dezelfde sleutel |
| `REQUESTED` | `UNKNOWN` | system | timeout |
| `UNKNOWN` | `SUBMITTED` / `SUCCEEDED` / `FAILED` | reconciliation | opgevraagd bij de provider |
| `SUBMITTED` | `SUCCEEDED` | provider / reconciliation | creditnota, mail, retour → `REFUNDED` |
| `SUBMITTED` | `FAILED` | provider / reconciliation | alert; zichtbaar in paneel; nieuwe refund mag (nieuwe sleutel) |

**Verboden:** een refund `SUCCEEDED` markeren zonder bevestiging van de
provider; een tweede refund aanmaken terwijl er één in `UNKNOWN` staat voor
hetzelfde doel (eerst opvragen); een bedrag uit de browser overnemen.

---

## Return

| Status | Betekenis | Terminaal |
|---|---|---|
| `REQUESTED` | Klant heeft aangemeld (ordernummer + mailadres gecontroleerd) | nee |
| `RECEIVED` | Pakket binnen, gecontroleerd | nee |
| `REJECTED` | Afgewezen met reden (aan de klant gemeld) | ja |
| `REFUNDING` | Refund aangemaakt | nee |
| `REFUNDED` | Refund `SUCCEEDED` | ja |
| `WITHDRAWN` | Klant trekt de aanvraag in | ja |

| Van | Naar | Actor | Voorwaarde / effect |
|---|---|---|---|
| — | `REQUESTED` | customer | order betaald; binnen termijn; **geen andere open retour** (unieke sleutel); aantallen ≤ geleverd − eerder geretourneerd |
| `REQUESTED` | `RECEIVED` | admin | — |
| `REQUESTED`, `RECEIVED` | `REJECTED` | admin | reden verplicht; mail |
| `REQUESTED` | `WITHDRAWN` | customer / admin | — |
| `RECEIVED` | `REFUNDING` | admin | refund `REQUESTED` met server-side bedrag (verzendkostenregels `docs/RETOUREN.md`) |
| `REQUESTED` | `REFUNDING` | admin | alleen als de klant een verzendbewijs gaf en het beleid dat toestaat (`docs/RETOUREN.md`) |
| `REFUNDING` | `REFUNDED` | system | refund `SUCCEEDED` |
| `REFUNDING` | `RECEIVED` | system | refund `FAILED` én de retour kwam uit `RECEIVED` (volgens de eventlog); alert |
| `REFUNDING` | `REQUESTED` | system | refund `FAILED` én de retour kwam uit `REQUESTED` (verzendbewijs, pakket nog niet binnen); alert |

---

## Supplier order (inkooporder)

Per bron/verkoper één inkooporder. WonZo koopt automatisch in (D-04): de code
zet de status, via deze machine. De handmatige overgang hieronder blijft
bestaan maar wordt niet gebruikt zolang D-04 automatisch is.

| Status | Betekenis | Terminaal |
|---|---|---|
| `DRAFT` | Voorbereid uit de bevroren regels (aanbieding, aantal, adres) | nee |
| `SUBMITTING` | Intent vastgelegd, call loopt (alleen automatisch) | nee |
| `UNKNOWN` | Call gaf geen uitsluitsel | nee |
| `PLACED` | Leverancier bevestigde, met `supplierOrderRef` | nee |
| `REJECTED` | Leverancier weigerde (voorraad, prijs, adres) | ja |
| `PARTIALLY_SHIPPED` / `SHIPPED` / `DELIVERED` | Leverstatus | `DELIVERED` ja |
| `CANCELLED` | Bij de leverancier geannuleerd | ja |

| Van | Naar | Actor | Voorwaarde / effect |
|---|---|---|---|
| — | `DRAFT` | system | order → `FULFILLMENT_PENDING` |
| `DRAFT` | `PLACED` | admin (handmatig — niet in gebruik, D-04) | `supplierOrderRef` en werkelijke inkoopprijs ingevuld; afwijking van de snapshot → alert |
| `DRAFT` | `SUBMITTING` | system (automatisch) | sleutel = supplierOrder.id, meegestuurd als eigen referentie bij de leverancier (`docs/api/LEVERANCIER.md` § 10) |
| `SUBMITTING` | `PLACED` / `REJECTED` | system | antwoord leverancier |
| `SUBMITTING` | `UNKNOWN` | system | timeout |
| `UNKNOWN` | `PLACED` / `REJECTED` | admin / reconciliation | **eerst bij de leverancier opvragen op de eigen referentie**; nooit blind opnieuw versturen |
| `PLACED` | `PARTIALLY_SHIPPED` / `SHIPPED` | admin / provider | tracking |
| `PARTIALLY_SHIPPED` | `SHIPPED` | admin / provider | — |
| `SHIPPED` | `DELIVERED` | admin / provider / system | — |
| `DRAFT`, `PLACED` | `CANCELLED` | admin | bij `PLACED` alleen na bevestiging van de leverancier |

**Verboden:** `UNKNOWN → SUBMITTING` (een tweede verzending zonder te weten of
de eerste aankwam is een tweede factureerbare bestelling); een inkooporder
plaatsen voor een order die niet `FULFILLMENT_PENDING` is.

**Herstel bij `REJECTED`:** de order gaat naar `PARTIALLY_FULFILLED`; de
beheerder kiest een andere aanbieding (nieuwe `DRAFT`, prijsverschil zichtbaar)
of betaalt het deel terug (refund-flow). De klant krijgt bericht. Bij WonZo is
de waarschijnlijke oorzaak te weinig tegoed bij de leverancier; of er dan na
opwaarderen opnieuw besteld wordt of terugbetaald, is nog open in D-04.
