# Hoe je weet dat het werkt

**Geautomatiseerd testen is de norm voor bedrijfskritieke logica.** In de
browser kijken, controlescripts en een echte doorloop vóór livegang horen
erbij — als aanvulling, niet als vervanging. Wat niet getest is, is een
aanname. Regels voor het schrijven van tests: `.claude/rules/testen.md`.

De testrunner en E2E-tool zijn een keuze (D-17); dit document beschrijft
**wat** er getest moet worden.

---

## De lagen

| Laag | Wat | Tegen | Draait |
|---|---|---|---|
| **Unit** | Pure functies: geld, btw, korting, verzending, state-machinetabellen | niets extern | elke commit, lokaal en CI |
| **Integration** | Database, adapter, webhook-handler, outbox, reconciliatie | echte database (zelfde soort en versie); provider- en leverancierstubs met opgenomen antwoorden | elke PR |
| **Security** | Autorisatie, CSRF, webhookverificatie, IDOR, rate limits | de app in testmodus | elke PR |
| **E2E** | De klantreis in een echte browser | app + testdatabase + betaaldienst in testmodus of stub | elke PR naar `main`, en vóór elke release |

## Unit — verplicht voor

Prijsopbouw, btw, kortingen, verzendkosten, winkelwagentotaal, ordertotaal,
terugbetalingen. Test de randen:

- een bedrag van één cent; een totaal van nul
- een korting die precies de ondergrens raakt, en één die eroverheen gaat
  (per artikel begrensd) — en een ongeldig percentage (geweigerd)
- een bestelling precies op en net onder de gratis-verzenddrempel, met en
  zonder code ("een korting maakt een bestelling nooit duurder")
- afronding: een percentage op een oneven bedrag; btw per regel vs. per tarief
  volgens D-15 — en dat pagina, winkelwagen, checkout, mail en factuur
  hetzelfde bedrag geven
- verdeling van een code over regels met verschillende btw-tarieven; de som
  van de delen is exact het kortingsbedrag
- een gedeeltelijke terugbetaling met code-aandeel en verzendkosten
- een ontbrekende adviesprijs; supplier-prijzen als string
- valuta: rekenen met twee valuta gooit
- elke state machine: alle toegestane transities slagen, de verboden uit
  `docs/STATE_MACHINES.md` gooien

**Reken één echt geval met de hand na** en zet de bedragen in het commentaar.

## Integration — verplicht voor

| Onderwerp | Gevallen |
|---|---|
| Database | migraties van leeg tot nu; compare-and-set bij gelijktijdige transitie; unieke sleutels (checkout, event, code per klant, open retour); factuurteller onder gelijktijdigheid |
| Supplier-adapter | elke fixture uit `docs/SUPPLIER_RESILIENCE.md`: mapping, overslaan, foutclassificatie, breaker, geen retry op schrijfacties |
| Payment-webhooks | geldig; ongeldige handtekening; dubbel event; events in omgekeerde volgorde; bedrag wijkt af → hold; database faalt → non-2xx en later succes |
| Reconciliatie | elke rij uit "wanneer lokaal en provider uiteenlopen" (`docs/PAYMENTS.md`) |
| Idempotentie | elke rij uit `docs/IDEMPOTENCY.md` twee keer, ook parallel → één bijwerking |
| Outbox | mail faalt → order blijft `PAID`, retry, vlag pas na succes |

**Gelijktijdigheid bewijzen:** twee verbindingen, dezelfde handeling tegelijk.
Bij een werkende vergrendeling wacht de tweede en schrijft niets dubbel.

## Security — verplicht voor

- **Autorisatie**, per server-handeling: niet ingelogd → 401/redirect; verkeerde
  rol of ander object → 403/404; bevoegd → slaagt. Bij de eerste twee: ook
  geen bijwerking in de database.
- **IDOR**: order, factuur, retour en statuslink van klant A zijn niet op te
  halen met de id of het nummer van klant A door klant B, en niet zonder token.
- **CSRF**: state-wijzigende request zonder token of met vreemde `Origin` wordt
  geweigerd; GET wijzigt nooit iets.
- **Webhookverificatie**: zie integration.
- **Rate limits**: inloggen, code-invoer, retouraanvraag — de N+1e poging wordt
  geweigerd.
- **Invoer**: XSS-payload in naam/adres/productnaam wordt geëscaped in pagina,
  mail en PDF; SQL-metatekens geven geen fout of ander resultaat.
- **Headers**: aanwezig op een representatieve set routes; CSP blokkeert de
  checkout niet (E2E).

## E2E — de kritieke reis

```text
product → winkelwagen → checkout → betaling (testmodus/stub) → webhook → order
```

Controleer onderweg: hetzelfde bedrag op elk scherm; dubbelklik op "Bestellen
en betalen" geeft één order; afgebroken betaling geeft een weg terug; de
bevestigingspagina zonder webhook toont een eerlijke tussenstand; na de
webhook staat de order op `PAID` en staat er één bevestiging in de outbox.

Daarnaast: retour aanmelden tot en met terugbetaling (beheer), en inloggen
met MFA.

## Handmatig — aanvullend, met bewijs

Elk scherm dat je af noemt is minstens één keer echt geopend:

- [ ] telefoonbreedte **en** een echt toestel; desktop
- [ ] donkere modus
- [ ] alleen toetsenbord, van boven naar beneden, focus zichtbaar
- [ ] schermlezer op de checkout (`docs/ACCESSIBILITY.md`)
- [ ] trage verbinding nagebootst
- [ ] de toestanden laden, leeg, fout, gevuld en succes
- [ ] de console zonder waarschuwingen

## Controlescripts — voor koppelingen

Los van de site, zodat je binnen een minuut weet of het aan de winkel ligt of
aan de koppeling:

| Script | Controleert |
|---|---|
| database | verbinding én migratiestand gelijk aan de code |
| mail | dat er echt een bericht aankomt (naar een testadres) |
| betaaldienst | welke sleutel actief is (test/live) en welke methodes aanstaan |
| leverancier | dat het token werkt en wat één artikel teruggeeft |

## De keten die je niet durft te testen

Een echte betaling, een echte terugbetaling, een echte inkooporder. Die worden
nooit getest, en draaien dan op de dag dat het moet voor het eerst.

**Eén keer echt, met een klein bedrag, vóór livegang — uitgevoerd door de
eigenaar, niet door Claude.** Leg vast wanneer en met welk resultaat; zolang
dat er niet staat, is het niet gebeurd (`docs/CHECKLIST.md`).

## Teksten en prestaties

- Alle talen hebben dezelfde sleutels — gecontroleerd door een script in CI;
  een ontbrekende sleutel laat de build falen.
- Prestaties meten op een nagebootste trage verbinding; tel één keer het
  aantal leveranciercalls per paginaweergave.

---

**"Het werkt bij mij" is geen bevinding.** Zeg wat je hebt uitgevoerd, waar,
en wat je zag — en wat je niet hebt kunnen controleren hoort er net zo goed
bij. De Definition of Done staat in `CLAUDE.md`.
