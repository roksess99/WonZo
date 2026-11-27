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
  unitPriceCents,                            // incl. btw, wat de klant betaalde (na een actie)
  listPriceCents, promotionId?,              // de prijs vóór de actie, en welke actie (gebouwd 2026-11-02)
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
is `WZ-2026-00001`; een order mag 30 minuten na het aanmaken betaald worden
(`snapshot_expires_at`; D-22, eigenaar 2026-11-17); het annuleervenster eindigt 30 minuten na de betaling
(`cancel_window_ends_at`, D-04). Nog niet: btw-bedragen per regel (D-15; het
tarief wordt wel bevroren), korting (D-08), `payments` en `refunds` (fase 5,
D-05), `supplier_orders`, `returns`.

**Gebouwd in fase 5** (`db/migrations/0003_payments.sql`): `payments`,
`payment_events`, `refunds`, `refund_events`, `provider_events` en
`rate_limits`. Een betaling bestaat lokaal vóór Mollie hem kent; haar id is de
idempotentiesleutel. Mollie heeft geen event-id: `provider_events` is uniek op
(betaling, opgevraagde stand). Het terugbetaalde bedrag wordt afgeleid uit
`refunds`, nooit los bijgehouden.

**Gebouwd in fase 6** (`db/migrations/0004_service_checks.sql`):
`service_checks`, de laatste uitkomst per controle van een externe dienst
(werkt Mollie, wat is het tegoed bij BigBuy). Een cache, geen bedrijfsstaat;
hij staat in de database omdat het tegoed maar één keer per uur opgevraagd
mag worden en een herstart dat niet mag vergeten.

Ook in fase 6 (`db/migrations/0005_supplier_orders.sql`): `supplier_orders`
en `supplier_order_events`. Eén inkooporder per bestelling en bron; de regels
zijn de bevroren bestelregels van die bron. `reference` (het ordernummer) gaat
als eigen referentie mee naar de leverancier en is uniek per bron. Bewaard:
de bevroren inkoopprijs, wat de leverancier bij de controle vroeg, wie een
hogere prijs goedkeurde, en de pogingen (D-04).

En (`db/migrations/0006_outbox_message_id.sql`): `outbox.message_id`, het
kenmerk dat de mailserver teruggeeft. De outbox kent nu de standen `PENDING`,
`SENT` (mail weg), `DONE` (afgehandeld zonder mail, of inkooporder gemaakt) en
`FAILED` (mail kon niet weg; in "vraagt aandacht", opnieuw te versturen).

En (`db/migrations/0010_reviews.sql`, D-12): `reviews` (één per bestelling
en onderwerp — de winkel of één artikel — met sterren, tekst, de zelfgekozen
naam, status en het antwoord van de winkel), `review_tokens` (de sleutel in
de uitnodiging, als hash) en `review_optouts` (afgemelde mailadressen, als
hash). En `db/migrations/0009_page_views.sql` (D-10): paginaweergaven per dag
en pad.

En (`db/migrations/0008_returns_tracking.sql`): `returns` met `return_lines`
en `return_events` (een aanvraag met per bestelregel aantal en reden, het
maximum dat terug kan, en wat de beheerder terugbetaalde; één open retour per
bestelling via een unieke sleutel op `open_order_id`), `shipments` (de
pakketten die de leverancier meldt, met trackingnummer), `shipped_at` en
`delivered_at` op bestelling en inkooporder (de herroepingstermijn loopt vanaf
de aflevering), `refunds.return_id`, en op `invoices` een `doc_key`
(`invoice`, `cancel` of `return:<id>`) en `return_id`: één creditnota per
retour.

En (`db/migrations/0007_invoices.sql`): `invoices` (factuur of creditnota,
nummer, totalen, het document als `snapshot` en de PDF zelf) en `invoice_vat`
(per tarief de grondslag en de btw, voor het maandoverzicht). Eén factuur en
hoogstens één creditnota per bestelling. Een uitgereikt document wordt nooit
gewijzigd.

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

### PriceRules, Promotion en DiscountCode

**Prijsregel** (D-03, D-16; gebouwd 2026-11-02, migratie 0012):
`price_settings` (één rij: standaardopslag of leeg, betaalkosten per stuk,
een versienummer dat bij elke wijziging aan regels of acties omhoog gaat) en
`price_markups` (een opslag per subcategorie, sleutel
`categorie/subcategorie`). Rekenwerk: `src/lib/pricing/rules.ts`.

**Actie** (`promotions`, D-08): wijst een categorie, een subcategorie of één
artikel aan.

| Veld | Opmerking |
|---|---|
| `target_kind`, `target_key` | `category` / `subcategory` / `product`, en welke |
| `percent_bp` | geldig bereik 1–95 %; daarbuiten geweigerd |
| `starts_at`, `ends_at` | het einde hoort er niet meer bij |
| `stopped_at`, `stopped_by` | **stoppen is niet weggooien**: het einde wordt "nu", de rij blijft |

**Kortingscode** (`discount_codes`, D-08; gebouwd 2026-11-02, migratie 0013):

| Veld | Opmerking |
|---|---|
| `code` | hoofdletters, uniek — ook na het einde |
| `percent_bp` | 1–95 % |
| `min_subtotal_cents` | over de artikelen incl. btw; 0 is geen minimum |
| `max_uses` | NULL is onbeperkt |
| `starts_at`, `ends_at`, `stopped_at`, `stopped_by` | zoals bij een actie |

**Gebruik** (`discount_redemptions`): één rij per betaalde bestelling met een
code, uniek op (`code_id`, `email_hash`) — "één keer per klant" — en op
`order_id`. Geschreven bij de overgang naar `PAID`, nooit eerder.

In de bestelling: `orders.discount_code_id`, `discount_code` (de tekst),
`discount_cents`; per regel `order_lines.code_discount_cents` (het aandeel,
D-15; `line_total_cents` blijft vóór de code); per retourregel
`return_lines.code_discount_cents`. Het totaal is subtotaal − korting +
verzending.

### PriceHistory

De basis voor de "van"-prijs en voor het reconstrueren van een prijs achteraf.
Het gaat om **onze verkoopprijs**, niet de inkoopprijs van de leverancier.

Gebouwd (2026-11-02, `price_history`, `src/lib/discounts/history.ts`): **een
rij per wijziging**, niet per dag. De geplande taak vergelijkt elke ronde de
prijzen met de laatste rij per artikel, en na elke wijziging in het paneel
ook meteen.

| Veld | Opmerking |
|---|---|
| `source`, `product_id` | |
| `from_at` | vanaf wanneer deze prijs gold (UTC); sleutel met bron en artikel |
| `price_cents`, `currency` | wat de klant betaalde, incl. btw (na een actie) |
| `list_price_cents` | de prijs vóór een actie |
| `basis` | `markup` of `advised` |
| `promotion_id` | de actie, als die meedeed |

Eén markt (D-14), dus geen kolom voor de markt. Bewaartermijn: D-24
(minimaal de referentieperiode plus marge, langer als bewijs bij een geschil
gewenst is).

### ProductText

De eigen inleiding bij een artikel (gebruiker 2026-11-27), in
`product_texts` (migratie 0014). Eigen tabel, niet in de catalogustabellen:
die worden elke nacht opnieuw gevuld (D-31), deze tekst is niet terug te
halen.

| Veld | Opmerking |
|---|---|
| `source`, `product_id` | het artikel zoals de catalogus het kent |
| `intro_nl`, `intro_en` | gewone tekst, hoogstens 600 tekens; leeg is "geen inleiding" |
| `version` | omhoog bij elke opslag; opslaan alleen op de versie die het formulier toonde |
| `updated_at`, `updated_by` | wie het laatst schreef |

Elke wijziging komt met de hele tekst ervoor en erna in het logboek
(`product.text-changed`): zo is een eerdere versie terug te vinden. Geen
persoonsgegevens.

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
| `AdminUser` (`admins`) | `email`, `name`, `role` (één van drie vaste rollen, D-07), `passwordHash?` en `totpSecretEncrypted?` (leeg tot de uitnodiging is aangenomen), `totpLastStep?` (geen replay), `activatedAt?`, `disabledAt?`, `createdBy` |
| `AdminSetup` (`admin_setup`) | één rij, nooit meer: zodra hij bestaat is de opzetpagina dicht |
| `RecoveryCode` | `adminId`, `codeHash`, `usedAt?` |
| `Session` (`admin_sessions`) | `idHash`, `adminId`, `createdAt`, `lastSeenAt`, `expiresAt` — 30 minuten inactief, 12 uur maximaal (D-07); geen IP en geen user agent |
| `AdminInvite` (`admin_invites`) | `tokenHash`, `adminId`, `createdAt`, `expiresAt` (48 uur), `usedAt?`; de sleutel staat alleen in de mail |
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
