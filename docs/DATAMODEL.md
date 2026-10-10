# Datamodel — wat er bewaard wordt, en wat bevroren

Autoriteit: datacontract (5). Dit beschrijft de vorm van de gegevens, niet de
tabellen; vul de echte namen in zodra ze er zijn. Bij elke entiteit twee
vragen:

1. **Komt dit vers uit de catalogus, of is het bevroren?**
2. **Wie kan dit tegelijk met iemand anders aanpassen?**

Statussen en hun overgangen: `docs/STATE_MACHINES.md`. Waar het staat
(database, nooit filesystem): `.claude/rules/database.md`.

---

## Geld in het model

Elk bedrag is een integer in de kleinste eenheid **met valuta**
(`.claude/rules/geld.md`). In de tabellen hieronder betekent `…Cents` steeds
"integer minor units"; de valuta staat op de order (één valuta per order) of
per bedrag als er meerdere markten zijn (D-14).

---

## De scheidslijn: vers versus bevroren

**Alles wat de klant nog niet gekocht heeft komt vers.** De winkelwagen
bewaart alleen een verwijzing:

```text
CartItem { productId, quantity, source? }
```

Zo rekent een prijswijziging nooit een oude prijs af.

**Alles wat de klant wél gekocht heeft is bevroren.** Een bestelregel bewaart
wat er op het scherm stond en waarmee gerekend is:

```text
OrderLine {
  productId, source, supplierOfferId,        // welke aanbieding — voor de inkoop
  name, brand, sku, supplierSku,
  quantity,
  unitPriceCents,                            // incl. btw, vóór korting
  discountCents, discountRuleId?,            // toegepast, niet gevraagd
  allocatedOrderDiscountCents,               // aandeel van een kortingscode (D-15)
  vatRateBasisPoints, vatCents,              // 2100 = 21,00 %
  lineTotalCents,
  supplierCostCents, supplierCostCurrency,   // kostprijs op het moment van bestellen
  landedCostCents?                           // als D-16 dat definieert
}
```

De catalogus van morgen is geen bewijs van gisteren. **Dit is de fout die je
niet meer kunt repareren**: wie alleen het artikelnummer bewaart, kan over een
jaar niet meer vertellen wat hij verkocht heeft, tegen welke prijs, bij welke
verkoper hij moest inkopen, en wat de marge was.

---

## De entiteiten

### Product (niet opgeslagen — het contract van de adapter)

Eén type waar de hele winkel mee werkt (`src/lib/catalog/types.ts`). De
adapter vertaalt de leverancier hiernaartoe; componenten kennen alleen dit.

| Veld | Opmerking |
|---|---|
| `id` | string, van de leverancier |
| `source` | welke catalogus, als er meer dan één is |
| `slug` | leesbaar, met het id erin |
| `name`, `brand` | |
| `price` | `Money`, incl. btw — de verkoopprijs na prijsregel, vóór actie |
| `salePrice?` | `Money`, na actie; alleen als er een actie geldt |
| `referencePrice?` | `Money`, de "van"-prijs; alleen met voldoende prijsgeschiedenis (`docs/PRIJZEN.md`) |
| `discountPercent?` | wat werkelijk is toegepast, naar beneden afgerond |
| `vatRateBasisPoints` | |
| `availability` | `in_stock` / `backorder` / `out_of_stock` — geen boolean |
| `stock` | van de gekozen aanbieding |
| `offerId` | de gekozen aanbieding (prijs, voorraad en levertijd komen hiervandaan) |
| `imageUrl?` | mag ontbreken |
| `specs` | eigenschappen met het label van de leverancier |

`supplierCost` zit **niet** in het publieke `Product` dat naar componenten
gaat; de pricing-laag krijgt het via een server-only type.

### Order

| Veld | Opmerking |
|---|---|
| `id` | intern |
| `reference` | het nummer dat de klant ziet; mag raadbaar zijn |
| toegangssleutels | hash van het token in de statuslink, in een eigen tabel `order_access_tokens`: elk bericht krijgt een eigen sleutel, zodat het token zelf nergens bewaard hoeft te worden |
| `checkoutAttemptId` | idempotentiesleutel, uniek (`docs/IDEMPOTENCY.md`) |
| `status`, `holdReason?` | `docs/STATE_MACHINES.md` |
| `currency` | ISO 4217 |
| klantgegevens | naam, adres, mail, telefoon — zie `docs/PRIVACY.md` voor termijnen |
| `lines[]` | bevroren, zie boven |
| bedragen | subtotaal, verzendkosten (+ btw), korting, btw per tarief, totaal |
| `snapshotExpiresAt` | tot wanneer de bevroren bedragen betaald mogen worden |
| `discountCodeId?` | |
| `createdAt`, `paidAt`, `completedAt` | |

Bijbehorend: `order_events` (append-only statuslog), `payments`,
`refunds`, `supplier_orders`, `returns`, `outbox`.

**Gebouwd in fase 4** (`db/migrations/0002_orders.sql`): `orders`,
`order_lines`, `order_events`, `order_access_tokens`, `outbox`, `audit_log` en
`counters` (order- en straks factuurnummers, per reeks en jaar). Het ordernummer
is `WZ-2026-00001`; een order mag 60 minuten na het aanmaken betaald worden
(`snapshot_expires_at`); het annuleervenster eindigt 30 minuten na de betaling
(`cancel_window_ends_at`, D-04). Nog niet: btw-bedragen per regel (D-15; het
tarief wordt wel bevroren), korting (D-08), `payments` en `refunds` (fase 5,
D-05), `supplier_orders`, `returns`.

### Payment, Refund, ProviderEvent

| Entiteit | Kernvelden |
|---|---|
| `Payment` | `id` (= idempotentiesleutel), `orderId`, `status`, `amountCents`, `currency`, `provider`, `providerPaymentId?`, `method?`, timestamps |
| `Refund` | `id` (= idempotentiesleutel), `orderId`, `paymentId`, `returnId?`, `status`, `amountCents`, `currency`, `reason`, `requestedBy`, `providerRefundId?` |
| `ProviderEvent` | `provider`, `eventId` (uniek), `type`, `receivedAt`, `processedAt?`, `payloadHash` — geen volledige kaartgegevens |

**Terugbetaald bedrag wordt afgeleid** (som van refunds `SUCCEEDED`), niet als
los veld op de order bijgehouden.

### SupplierOrder

| Veld | Opmerking |
|---|---|
| `id` | idempotentiesleutel bij automatisch inkopen |
| `orderId`, `source`, `lines[]` | welke regels, via welke aanbieding |
| `status` | `docs/STATE_MACHINES.md` |
| `supplierOrderRef?` | het nummer bij de leverancier |
| `actualCostCents?`, `currency` | wat het werkelijk kostte — afwijking van de snapshot is een signaal |
| `placedBy`, `placedAt` | |

### Invoice en CreditNote

Eigen nummerreeks, uit een teller in de database, in dezelfde transactie als
het document. Een creditnota bij elke terugbetaling, met verwijzing naar de
oorspronkelijke factuur. Inhoud, nummerbeleid en wettelijke status:
`docs/FACTUUR.md`. Een uitgereikte factuur wordt nooit gewijzigd.

### DiscountRule en DiscountCode

Een regel wijst een **groep** aan, geen lijst artikelen.

| Veld | Opmerking |
|---|---|
| `scope`, `target` | product / groep / soort / familie, en welke |
| `percent` | geldig bereik 1–95; daarbuiten geweigerd |
| `startsAt`, `endsAt` | |
| `disabledAt` | **stoppen is niet weggooien** |

Codes: zie `docs/PRIJZEN.md` § Kortingscodes; gebruik in
`discount_redemptions` met een unieke sleutel.

### PriceHistory

De basis voor de "van"-prijs en voor het reconstrueren van een prijs achteraf.
Het gaat om **onze verkoopprijs**, niet de inkoopprijs van de leverancier.

| Veld | Opmerking |
|---|---|
| `productId`, `source` | |
| `priceCents`, `currency` | de verkoopprijs incl. btw zoals de klant hem zag, vóór actie |
| `market` | land/kanaal als prijzen per markt verschillen (D-14) |
| `observedAt` | tijdstip van de meting (UTC) |
| `sourceOfObservation` | `scheduled_snapshot` / `price_rule_change` / `order` |
| `ruleVersion?` | welke prijsregel gold |

Unieke sleutel `(productId, source, market, observedAt::date, sourceOfObservation)`
voor de dagelijkse meting. Bewaartermijn: D-24 (minimaal de referentieperiode
plus marge, langer als bewijs bij een geschil gewenst is).

### Return

| Veld | Opmerking |
|---|---|
| `reference` | eigen nummer |
| `orderId` | |
| `status` | `docs/STATE_MACHINES.md` |
| `reason` | herroeping / verkeerd geleverd / beschadigd / defect — bepaalt wie de verzending betaalt |
| `lines[]` | welke regels, welke aantallen |
| `verifiedBy` | hoe de aanvraag gecontroleerd is (ordernummer + mailadres) |

Een unieke sleutel zorgt voor **één open retour per bestelling**.

### Admin, Session, AuditLog

| Entiteit | Kernvelden |
|---|---|
| `AdminUser` | `email`, `passwordHash`, `totpSecretEncrypted`, `permissions[]`, `disabledAt?` |
| `RecoveryCode` | `adminId`, `codeHash`, `usedAt?` |
| `Session` | `idHash`, `adminId`, `createdAt`, `lastSeenAt`, `expiresAt`, `ip?`, `userAgent?` |
| `AuditLog` | `actor`, `action`, `objectType`, `objectId`, `before?`, `after?`, `reason?`, `requestId`, `at` — alleen toevoegen |

---

## Waar twee verzoeken elkaar raken

Een controle in code is hier niet genoeg: tussen lezen en schrijven past een
tweede verzoek.

| Wat | Mechanisme |
|---|---|
| Factuurnummer | teller met vergrendelde rij, zelfde transactie |
| Order aanmaken (dubbele klik) | unieke `checkoutAttemptId` |
| Webhook dubbel | unieke `(provider, eventId)` |
| "Eén kortingscode per klant" | unieke `(codeId, klantsleutel)` |
| "Er loopt al een retour" | unieke open retour per order |
| Terugbetaalsom ≤ betaald | vergrendelde orderrij tijdens het aanmaken van een refund |
| Statusovergang | compare-and-set op status |
| Voorraad bij het afrekenen | D-22 |
| Geplande taak | claim/lease in `job_runs` |

---

## Bewaren en opruimen

Termijnen zijn deels wettelijk en deels beleid; de grondslag per gegeven staat
in `docs/PRIVACY.md`.

| Gegeven | Termijn | Soort |
|---|---|---|
| Facturen en de gegevens waaruit ze volgen | 7 jaar (NL) | `WETTELIJK` — fiscale bewaarplicht (art. 52 AWR); laten bevestigen |
| Verlopen sessies | opruimen | `BELEID` |
| Prijsgeschiedenis | D-24 | `BELEID` |
| Auditlog | D-24 | `BELEID` |
| Provider-events | zolang de betaling kan worden betwist | `BELEID` (D-24) |

Opruimen in de dagelijkse taak — en controleer dat de functie echt wordt
aangeroepen. Migraties en compatibiliteit: `.claude/rules/database.md`.
