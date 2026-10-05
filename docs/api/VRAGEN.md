# Vragen aan BigBuy

Wat je niet kunt meten moet je vragen. Hou hier bij wat er uitstaat en wat er
geantwoord is — anders vraagt de volgende persoon het opnieuw, of erger: hij
gokt het antwoord.

**Vraag in één bericht, niet in zeven.** Support bij een groothandel antwoordt
traag en vaak maar op de eerste vraag; nummer ze dus en zet er bij elke vraag
bij waarom je het wilt weten.

| # | Vraag | Gesteld | Antwoord |
|---|---|---|---|
| 1 | Heeft de sandbox een productcatalogus, en zo nee: hoe testen wij bestellen (`order/check`, `order/create`) zonder catalogus en zonder vervoerders? Alle productlijsten geven HTTP 400 en `shipping/carriers` is leeg (`docs/api/LEVERANCIER.md` § 2) | nog niet | |
| 2 | Opzoeken van een onbekende eigen referentie (`order/reference/{ref}`) geeft HTTP 500, geen 404. Hoe stellen wij na een timeout vast dat een bestelling níet is aangekomen? | nog niet | |
| 3 | Moet voor API-toegang tot de catalogus in productie iets geactiveerd worden in het account (pakket, abonnement)? | nog niet | |
| 4 | Ongeveer 1 % van de artikelen in de API heeft voorraad (GEMETEN 2026-10-05, bevestigd in het account). Is dat normaal, komt er regelmatig voorraad bij, en is er een manier om alleen leverbare artikelen op te vragen (een endpoint of filter op voorraad)? | nog niet | |
| 5 | Versturen jullie in neutrale verpakking of met de naam van de winkel? Wie is dan voor de verpakkingsregels (Verpact, PPWR) de producent van die verpakking? | nog niet | |
| 6 | Kunnen jullie per artikel leveren: conformiteitsverklaringen voor voedselcontact (en BPA-vrij), EUDR-referenties (DDS) voor hout, papier en houtskool, en informatie over zeer zorgwekkende stoffen (REACH art. 33)? | nog niet | |
| 7 | Zijn jullie in Nederland geregistreerd voor UPV Textiel, of moet de winkel dat zelf doen? | nog niet | |

## Vragen die je achteraf had willen stellen

Neem deze over voor zover ze op jouw leverancier slaan:

1. **Staat de inkoopprijs inclusief of exclusief btw, en de adviesprijs?**
   Vraag om een voorbeeld met bedragen van één artikel, en leg dat naast je
   eigen berekening.
2. **Wat telt het voorraadveld op het artikel?** De voorraad van alle
   verkopers, van de verkopers waar wij mee mogen handelen, of iets anders?
3. **Wordt de lijst met verkopers in het artikelantwoord afgekapt?**
4. **Zijn de id's van categorieën stabiel over de tijd?**
5. **Hoe lang mogen wij jullie productfoto's cachen, en mogen we ze via ons
   eigen domein serveren?**
6. **Wat gebeurt er bij een bestelling waarvan de voorraad net weg is?**
   Wordt hij geweigerd, deels geleverd, of nageleverd?
7. **Is er een testomgeving waarin een bestelling geen factuur oplevert?**
8. **Hoe worden retouren afgehandeld, en binnen welke termijn?**
9. **Krijgen wij bericht als een artikel vervalt of van nummer verandert?**
10. **Wat is de rate limit precies, per token of per account, en wat gebeurt er
    als we eroverheen gaan?**
11. **Kunnen we een eigen referentie of idempotentiesleutel meesturen bij een
    bestelling, en daarop terugzoeken?** Nodig om na een timeout te weten of
    een bestelling is aangekomen.
12. **Is er een statuspagina of storingsmelding?** Dan kan de winkel een
    storing aan hun kant onderscheiden van een fout aan de onze.

## Antwoorden die het ontwerp raken

Zet hier het antwoord én wat je ermee gedaan hebt. Een antwoord zonder gevolg
is informatie; een antwoord mét gevolg is een beslissing en hoort ook in
`docs/DECISIONS.md`.
