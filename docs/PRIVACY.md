# Privacy — wat de winkel verwerkt, waarom, en waar het heen gaat

Onderbouwing bij de privacyverklaring op de site. De pagina is voor de
bezoeker; dit bestand zegt **hoe het gecontroleerd is**, zodat niemand het uit
het hoofd hoeft bij te werken.

Juridische uitspraken hieronder zijn `WETTELIJK` met een bron, en worden door
een adviseur bevestigd voordat de privacyverklaring live gaat (D-10). Dit
document is geen juridisch advies.

Twee vragen die makkelijk door elkaar lopen:

1. **Wat komt er op het apparaat van de bezoeker?** Bepaalt of er een
   toestemmingsbanner moet komen (`WETTELIJK` NL: Telecommunicatiewet art.
   11.7a; EU: ePrivacyrichtlijn art. 5 lid 3).
2. **Wat verwerken wij en wie ontvangt het?** Bepaalt wat er in de
   privacyverklaring staat (`WETTELIJK`: AVG art. 13).

---

## Dataflows

```text
Browser ──► Applicatie ──► Database
                │
                ├──► Betaaldienst
                ├──► Leverancier / groothandel
                ├──► Mailprovider
                ├──► Error tracking / logs
                └──► Analytics (alleen als D-10 dat toestaat)
```

Per flow invullen zodra de partij gekozen is. Een lege cel is een open vraag,
geen "nvt".

| Flow | Gegevens | Doel | Grondslag (AVG art. 6) | Bewaartermijn | Rol ontvanger | Locatie | Versleuteling |
|---|---|---|---|---|---|---|---|
| Browser → applicatie | formuliervelden, IP, user agent | bestelling, beveiliging | b (overeenkomst), f (beveiliging) | IP in logs: `<<LOG_RETENTIE>>` | — | — | TLS |
| Applicatie → database | naam, adres, mail, telefoon, bestelling | levering, administratie | b; c (fiscale bewaarplicht) | `docs/DATAMODEL.md` § Bewaren | eigen (hosting = verwerker) | `<<HOSTING_LOCATIE>>` | TLS naar database; at rest: `<<DB_ENCRYPTIE>>` |
| Applicatie → betaaldienst | bedrag, ordernummer, mail (indien vereist) | betaling | b | volgens de betaaldienst | doorgaans zelfstandig verwerkingsverantwoordelijke voor de betaling — vastleggen bij D-05 | `<<BETAALDIENST_LOCATIE>>` | TLS |
| Applicatie → leverancier (BigBuy) | naam, afleveradres, **mailadres en telefoonnummer** (verplichte velden bij bestellen — `docs/api/LEVERANCIER.md` § 10), artikelen | levering (dropship) | b | volgens de leverancier | verwerker of zelfstandig — vastleggen bij D-01 | `<<LEVERANCIER_LOCATIE>>` | TLS |
| Applicatie → mailprovider | mailadres, naam, inhoud bericht | bevestiging, service | b | volgens de provider | verwerker | `<<MAIL_LOCATIE>>` | TLS |
| Applicatie → error tracking | technische context, **geen** persoonsgegevens (`docs/OBSERVABILITY.md`) | stabiliteit | f | `<<ERROR_RETENTIE>>` | verwerker | `<<ERROR_LOCATIE>>` | TLS |
| Browser → analytics | alleen met toestemming of een privacyvriendelijke opzet zonder tracking — D-10 | | a of f | | | | |

**Verwerkersovereenkomst** met elke verwerker (`WETTELIJK`: AVG art. 28).
**Doorgifte buiten de EER** alleen met een geldig mechanisme (AVG hoofdstuk V);
noteer per partij welk.

---

## Op het apparaat van de bezoeker

**Stel dit vast door de code te doorzoeken op élke schrijver** —
`localStorage`, `sessionStorage`, `document.cookie`, `Set-Cookie` — niet door
rond te klikken. Een sleutel die alleen bij het afrekenen ontstaat mis je met
bladeren.

| Sleutel | Soort | Geschreven door | Noodzakelijk? |
|---|---|---|---|
| | | | |

Vul ook in wat **niet** gebruikt wordt ("sessionStorage wordt nergens
gebruikt"). Dat is net zo goed een bevinding.

**Zonder toestemming mag** wat strikt noodzakelijk is voor de dienst die de
bezoeker vraagt, of het gevolg van een keuze van de bezoeker zelf:
winkelwagen, taal, thema, sessiecookie van het beheer.

**Toestemming vooraf is nodig** zodra er iets bijkomt dat geen van beide is:
analytics die niet onder een uitzondering valt, advertentiepixels, ingesloten
video, chatwidgets van derden. Dan: weigeren even makkelijk als accepteren, en
**niets laden voordat er gekozen is**.

## Op onze server

**Stel dit vast door de migraties langs te lopen** op kolommen die een persoon
aanwijzen.

| Tabel | Persoonsgegeven | Grondslag | Bewaartermijn | Verdwijnt met de bestelling? |
|---|---|---|---|---|
| | | | | |

Vuistregels voor de grondslag (`WETTELIJK`, AVG art. 6 lid 1):

- **b — uitvoering van de overeenkomst**: wat nodig is om te leveren.
- **c — wettelijke plicht**: facturen en de gegevens waaruit ze volgen
  (`WETTELIJK` NL: 7 jaar, art. 52 AWR).
- **f — gerechtvaardigd belang**: beveiligingslogs, "één code per klant". Een
  belangenafweging vastleggen. Let op: "één code per klant" betekent een
  gegeven bewaren nadat de bestelling weg is — zet het als eigen regel in de
  verklaring.

## Ontvangers

| Partij | Wat ze krijgen | Waarom |
|---|---|---|
| | | |

- **De betaaldienst wordt vergeten** als de verklaring dateert van vóór de
  betaalkoppeling. Loop deze lijst na bij elke nieuwe koppeling.
- **"Ontvangers of categorieën van ontvangers"** (AVG art. 13 lid 1 sub e):
  "onze groothandel" mag, verzwijgen niet.
- Staan productfoto's op het domein van de leverancier, dan staat die naam in
  de HTML en `og:image`. Dat los je niet met een tekst op.

## Derden in de browser

Streef ernaar dat de browser met niemand anders praat dan met de winkel en de
betaaldienst. Controleer het in het netwerkpaneel, niet in de code:
lettertypen zelf hosten, externe foto's via de eigen beeldoptimalisatie,
opzoekdiensten (adres) server-side.

| Uitzondering | Waarom het toch mag |
|---|---|
| | |

## Rechten van betrokkenen

Inzage, correctie en verwijdering moeten uitvoerbaar zijn: weet per tabel hoe
je de gegevens van één persoon vindt, en wat je niet mag wissen (fiscale
bewaarplicht) maar wel kunt afschermen.

## Datalek

Beoordelen binnen 72 uur na ontdekking of melding aan de toezichthouder nodig
is (`WETTELIJK`: AVG art. 33). Procedure: `docs/DISASTER_RECOVERY.md` §
Incident.

## Bijwerken

Verandert er iets aan browseropslag, een tabel met persoonsgegevens of een
ontvanger, dan in dezelfde PR: dit bestand, de privacypagina in alle talen, en
de datum "laatst bijgewerkt".
