---
paths:
  - "tests/**"
  - "src/**/*.test.ts"
  - "src/**/*.spec.ts"
  - "src/**/*.test.tsx"
  - "src/**/*.spec.tsx"
---

# Testen

Laadt bij werk aan tests en fixtures. De volledige strategie, de verplichte
gevallen en de handmatige controles staan in `docs/TESTEN.md`.

- **Geautomatiseerd is de norm** voor bedrijfskritieke logica. Handmatig in de
  browser kijken vervangt geen test.
- Een bugfix begint met een test die faalt.
- Tests zijn **deterministisch**: vaste klok, vaste seed, vaste fixtures. Geen
  echte leverancier, betaaldienst of mailserver in unit- en integratietests;
  wel hun contract (opgenomen antwoorden of een lokale stub).
- Elke nieuwe server-handeling krijgt drie autorisatiegevallen: niet ingelogd,
  verkeerde rol of ander object, bevoegd. Bij de eerste twee: ook controleren
  dat er **geen** bijwerking was.
- Elke webhook-handler: geldige handtekening, ongeldige handtekening, dubbel
  event, event in verkeerde volgorde, bedrag dat niet klopt.
- Geldtests rekenen één geval met de hand na en zetten de bedragen in het
  commentaar.
- Tests die geld, voorraad of inkoop raken draaien nooit tegen een live
  account. Een test die een echte betaling of inkooporder zou doen is een
  fout in de test.
- Test niet de implementatie maar het gedrag: bedragen, statussen,
  bijwerkingen in de database en de outbox.
