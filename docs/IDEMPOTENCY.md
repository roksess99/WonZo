# Idempotentie

Autoriteit: architectuurregel (6). Twee tabbladen, een dubbele klik, een
webhook die twee keer komt, een taak die na een crash opnieuw start: elk van
die gevallen moet hetzelfde resultaat geven als één keer.

---

## Drie begrippen die je uit elkaar houdt

| Begrip | Betekenis | Mechanisme |
|---|---|---|
| **Idempotent request** | Hetzelfde verzoek nogmaals met dezelfde sleutel geeft hetzelfde resultaat terug, zonder tweede bijwerking | Sleutel van de aanroeper + unieke index + opgeslagen resultaat |
| **Gededupliceerd event** | Een melding die vaker binnenkomt wordt één keer verwerkt | Unieke sleutel op het event-id van de afzender |
| **Retry-safe operatie** | Opnieuw uitvoeren na een gedeeltelijke mislukking brengt het systeem naar dezelfde eindstand | Compare-and-set op status + intent-records + de sleutel doorgeven aan de provider |

Ze stapelen: een webhook wordt **gededupliceerd**, de transitie die hij
uitvoert is **retry-safe**, en de refund die erop volgt is een **idempotent
request** bij de provider.

## De regels

- **De sleutel komt van ons en is stabiel per bedoeling**, niet per poging. Een
  retry gebruikt dezelfde sleutel. Een willekeurig getal per HTTP-poging
  maakt van elke retry een nieuwe boeking.
- **De sleutel wordt opgeslagen vóór de bijwerking**, met een unieke index.
  Een tweede verzoek met dezelfde sleutel leest het opgeslagen resultaat.
- **Zelfde sleutel, andere inhoud** (bijv. ander bedrag) = fout (409), niet
  stil het nieuwe uitvoeren. Bewaar daarom een hash van de relevante inhoud.
- **Geef de sleutel door aan de provider** als die idempotentie ondersteunt
  (`GEDOCUMENTEERD` per provider bij D-05 / `docs/api/LEVERANCIER.md`). Doet de
  provider dat niet, dan is de intent-record + reconciliatie de enige
  bescherming — leg dat vast.
- **Onbekende uitkomst ≠ mislukt.** Na een timeout eerst opvragen, dan pas
  beslissen.

## Per operatie

| Operatie | Sleutel | Persistentie | TTL | Retry | Provider | Herstel |
|---|---|---|---|---|---|---|
| **Checkout** (order aanmaken) | `checkoutAttemptId` (UUID gegenereerd bij het openen van de checkout, meegestuurd in het formulier) | unieke index op `orders.checkout_attempt_id` | tot de order terminaal is | dubbele submit → dezelfde order terug | n.v.t. | — |
| **Payment aanmaken** | `payment.id` | `payments` (record bestaat vóór de call) | levensduur van de payment | zelfde sleutel naar de provider | idempotency key indien ondersteund; anders metadata `payment.id` | reconciliatie op metadata |
| **Webhook** | event-id van de provider (of hash van body + tijdstempel als er geen id is) | `provider_events` unieke index | ≥ de retry-periode van de provider; in de praktijk bewaren voor audit | dubbel → 200 zonder werk | — | reconciliatie |
| **Statustransitie** | `(object, from, to)` via compare-and-set | statuskolom + `*_events` | — | herhaling = no-op | — | — |
| **Refund** | `refund.id` | `refunds` (record `REQUESTED` vóór de call) | levensduur | zelfde sleutel | idempotency key indien ondersteund | `UNKNOWN` → opvragen |
| **Inkooporder** (automatisch) | `supplierOrder.id` | `supplier_orders` (`SUBMITTING` vóór de call) | levensduur | **geen automatische retry na `UNKNOWN`** | eigen referentie, terug te zoeken bij de leverancier (`GEDOCUMENTEERD`); of de leverancier een dubbele referentie weigert: meten (`docs/api/LEVERANCIER.md` §10) | opvragen op de eigen referentie; een fout bij het opzoeken bewijst niet dat de bestelling ontbreekt (GEMETEN 2026-10-05 in de sandbox: onbekende referentie → HTTP 500, `docs/api/LEVERANCIER.md` § 10) — dan blijft hij `UNKNOWN` en wordt hij handmatig nagegaan |
| **Geplande taak** | `(taaknaam, periode)` bijv. `price-snapshot:2026-03-14` | `job_runs` unieke index, lease met verlooptijd | periode + marge | tweede aanroep ziet de claim en stopt; verlopen lease mag overgenomen worden | — | taak is zelf retry-safe per item |
| **Mail** | `(orderId, berichtsoort)` of outbox-id | `outbox` met status en `sentAt` | levensduur van de order | backoff; vlag pas na geslaagde verzending | message-id van de mailprovider indien beschikbaar | handmatig opnieuw versturen in het paneel |
| **Voorraadreservering** | `(orderId, regel)` | `reservations` unieke index | tot verloop van de snapshot | herhaling = zelfde reservering | n.v.t. bij dropship zonder lokale voorraad (D-22) | taak die verlopen reserveringen vrijgeeft |
| **Kortingscode gebruiken** | `(codeId, klantsleutel)` voor "één keer per klant"; `orderId` voor het verbruik | `discount_redemptions` unieke index | permanent | dubbel → één gebruik | — | verbruik pas bij `PAID` (`docs/PRIJZEN.md`) |
| **Factuurnummer** | `orderId` (één factuur per order) | unieke index `invoices.order_id`; teller in dezelfde transactie | permanent | herhaling geeft dezelfde factuur | — | — |

## Mail: at-least-once, bewust

Mail heeft geen transactie met de database. Je kiest tussen "misschien niet"
en "misschien twee keer". Deze set kiest **at-least-once**: de vlag wordt pas
na een geslaagde verzending gezet. Een crash tussen verzenden en vlag zetten
geeft één dubbele mail — dat is beter dan een klant zonder bevestiging. De
outbox maakt dat zeldzaam en zichtbaar.

## Testen

Voor elke rij hierboven één test die dezelfde handeling twee keer doet
(parallel waar het om gelijktijdigheid gaat) en controleert dat er één
bijwerking is. Zie `docs/TESTEN.md`.
