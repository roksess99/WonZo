# Checkout en betalen — de architectuur

Autoriteit: architectuurregel (6). Statussen: `docs/STATE_MACHINES.md`.
Sleutels: `docs/IDEMPOTENCY.md`. De keuze van de betaaldienst is D-05; dit
document is providerneutraal.

---

## Het probleem dat dit oplost

De naïeve volgorde is:

```text
charge payment  →  create order        ✗
```

Lukt de betaling en faalt daarna de database (crash, deploy, timeout), dan
heeft de klant betaald voor een bestelling die niet bestaat. Andersom —
"bestelling als betaald markeren en dan pas afschrijven" — staat er een betaald
order zonder geld. Beide komen voor; ze zijn niet te voorkomen met "voorzichtig
programmeren", alleen met een volgorde waarin **elke stap een spoor achterlaat
dat later te herstellen is**.

## Vier dingen, apart gehouden

| Onderdeel | Is | Is niet |
|---|---|---|
| **Order** | Wat de klant koopt: bevroren regels en bedragen | Het bewijs dat er betaald is |
| **Payment** | Eén betaalpoging bij de provider, met eigen status | De order |
| **Webhook-event** | Een melding van de provider dat er iets veranderde | Een betrouwbare bron voor bedrag of status |
| **Reconciliatie** | Periodiek vergelijken van lokale en provider-stand | Een noodgreep; het is een vast onderdeel |

Een order kan meerdere payments hebben (een mislukte poging, dan een
geslaagde). Een payment hoort bij precies één order.

---

## De volgorde

```text
1. quote          server herberekent winkelwagen → bedragen (niets opgeslagen)
2. create order   order PENDING_PAYMENT + bevroren snapshot      (transactie A)
                  idempotentiesleutel = checkout-poging-id
3. create payment payment CREATED, idempotentiesleutel = payment.id (transactie A)
   ── commit ──
4. provider call  createPayment(amount uit snapshot, key = payment.id,
                  metadata = order.id, payment.id)
5. record         payment PENDING + providerPaymentId           (transactie B)
6. redirect       klant naar de provider
7. webhook        verifiëren → event opslaan (dedupe) → status opvragen bij
                  provider → vergelijken met snapshot →
                  payment PAID + order PAID + outbox-records     (transactie C)
8. outbox         bevestigingsmail, factuur, melding beheerder (los, met retry)
9. fulfillment    order → FULFILLMENT_PENDING → … (docs/STATE_MACHINES.md)
```

**Stap 2 vóór stap 4 is de kern.** Er bestaat altijd een lokaal record vóór de
provider iets weet, met een sleutel die de provider terugkrijgt. Wat er ook
crasht, reconciliatie kan het koppelen.

### Wat er misgaat per stap, en wat dan

| Faalt bij | Toestand | Herstel |
|---|---|---|
| 2 | Niets opgeslagen | Klant ziet een fout en kan opnieuw; dezelfde checkout-sleutel geeft dezelfde order terug |
| 4, met fout | Payment `CREATED`, provider weet niets | Klant krijgt "probeer opnieuw"; nieuwe poging hergebruikt de payment met dezelfde sleutel |
| 4, timeout | Payment `CREATED`, provider **misschien** wel | Status `UNKNOWN`; reconciliatie zoekt bij de provider op metadata/sleutel. Niet blind een nieuwe payment aanmaken |
| 5 | Provider heeft payment, lokaal geen `providerPaymentId` | Zelfde sleutel opnieuw naar de provider geeft dezelfde payment terug; anders reconciliatie op metadata |
| 7, verificatie | Event geweigerd (401) | Provider probeert opnieuw; een echte betaling komt ook via reconciliatie binnen |
| 7, database | Event niet verwerkt; handler geeft non-2xx | Provider probeert opnieuw; reconciliatie vangt het als de retries op zijn |
| 8 | Order `PAID`, mail niet verstuurd | Outbox probeert opnieuw met backoff; na N pogingen een alert en zichtbaar in het paneel |

---

## Webhooks

1. **Verifiëren** — handtekening, of bij een provider zonder handtekening: de
   body alleen als aanleiding gebruiken en de status zelf ophalen.
2. **Opslaan en dedupliceren** — `provider_events` met unieke sleutel op het
   event-id van de provider. Bestaat hij al: 200 en klaar.
3. **Status bij de bron** — vraag de payment op bij de provider. Bedrag,
   valuta en status komen uit dat antwoord, niet uit de webhook-body.
4. **Vergelijken met de snapshot** — bedrag en valuta moeten exact gelijk zijn
   aan de bevroren order. Wijkt het af: payment `PAID` maar order
   **niet** naar `PAID`; markeer `AMOUNT_MISMATCH`, alert, geen fulfillment.
5. **Transitie** — compare-and-set op payment en order in één transactie, met
   outbox-records. Een transitie die al gedaan is (dubbel of oud event) is een
   no-op, geen fout.
6. **Antwoorden** — 2xx alleen na commit. Zwaar werk via de outbox.

Events kunnen **in de verkeerde volgorde** komen (eerst "paid", dan
"pending"). De state machine weigert een transitie terug; daarom is "status
opvragen bij de bron" in stap 3 leidend en niet de volgorde van binnenkomst.

## De terugkeerpagina

De klant komt terug met parameters in de URL. **Die bewijzen niets.** De pagina:

- toont de lokale status van de order;
- mag server-side de status bij de provider opvragen (dat is een geverifieerde
  bron) en dezelfde transitie uitvoeren als de webhook — via dezelfde functie;
- toont bij `PENDING` een eerlijke tussenstand ("we wachten op de bevestiging
  van je betaling") en ververst, in plaats van te doen alsof het gelukt is.

---

## Snapshot en verloop

- Bij `PENDING_PAYMENT` zijn regels, prijzen, kortingen, btw, verzendkosten,
  valuta en de gekozen aanbieding per regel **bevroren**.
- Een snapshot heeft een geldigheid (D-05/D-22). Na afloop: order
  `CANCELLED` (reden `EXPIRED`) via een geplande taak, na controle bij de
  provider dat er geen geslaagde payment is.
- Een nieuwe betaalpoging op een verlopen snapshot maakt een **nieuwe quote**;
  ziet de klant een ander bedrag, dan zegt het scherm dat vóór de betaling.

---

## Reconciliatie

Vast onderdeel, geen noodgreep. Twee ritmes:

| Taak | Wanneer | Wat |
|---|---|---|
| Lopende betalingen | elke paar minuten | Payments in `CREATED`, `PENDING`, `UNKNOWN` ouder dan X min: status opvragen bij de provider en dezelfde transitiefunctie aanroepen |
| Dagafsluiting | dagelijks | Alle provider-transacties van gisteren (betalingen, terugbetalingen, chargebacks) naast de lokale records leggen; elk verschil wordt een melding |

### Wanneer lokaal en provider uiteenlopen

| Provider | Lokaal | Betekenis | Actie |
|---|---|---|---|
| paid | pending | webhook gemist | Automatisch naar `PAID` via de transitiefunctie |
| paid | order `CANCELLED` (verlopen) | betaald na verloop | **Alert**; eigenaar kiest heropenen of terugbetalen. Niet automatisch |
| paid, ander bedrag | pending | gemanipuleerd of fout in snapshot | `AMOUNT_MISMATCH`, alert, geen fulfillment |
| failed / expired | pending | klant haakte af | Payment naar `FAILED`/`EXPIRED`; was dit de laatste poging, dan order naar `PAYMENT_FAILED` (`docs/STATE_MACHINES.md`); daarna nieuwe poging of verloop → `CANCELLED` |
| refunded / chargeback | paid | buiten de winkel om | Lokaal bijwerken, alert, auditregel |
| onbekend bij provider | `UNKNOWN` | call kwam nooit aan | Na de wachttijd `FAILED`; klant kan opnieuw |

Elke automatische correctie gaat via dezelfde transitiefunctie als de webhook
en krijgt een auditregel met bron `reconciliation`.

---

## Terugbetalingen

Dezelfde volgorde, kleiner:

```text
refund REQUESTED  (bedrag server-side berekend, sleutel = refund.id)  → commit
provider call     (key = refund.id)
refund SUBMITTED  (providerRefundId)          of UNKNOWN bij timeout
webhook/opvragen  → SUCCEEDED / FAILED
```

Een order is pas "terugbetaald" als de refund `SUCCEEDED` is. De
terugbetaalsom wordt afgeleid uit de refunds, niet los bijgehouden.
Creditnota bij `SUCCEEDED` (`docs/FACTUUR.md`).

## Wat er in de code moet zitten

- Eén functie per transitie (`markPaymentPaid(paymentId, source)`), gebruikt
  door webhook, terugkeerpagina en reconciliatie.
- Geen code die `order.status = 'PAID'` zet buiten die functie.
- Een test per rij uit de tabel "wat er misgaat per stap" en "wanneer lokaal en
  provider uiteenlopen" (`docs/TESTEN.md`).
