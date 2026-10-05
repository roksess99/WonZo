# Hosting — waarnemingen uit een eerder project

**Status van dit document:** referentie, `EERDER WAARGENOMEN`. Alles hieronder
is in een vorig project misgegaan, op gedeelde hosting met een
serverrenderend Node-framework, pnpm en MariaDB. Het is **providerspecifiek**
en niet opnieuw gemeten. Gebruik het als lijst van dingen om te **meten** voor
de keuze bij D-00 en D-06 — niet als feiten over jouw omgeving.

Het generieke uitrolproces staat in `docs/CI_CD.md`.

## 1. De bouw draait op een machine die minder mag

**Processen zijn begrensd.** Moderne bundelaars starten losse node-processen
voor onderdelen van de bouw. Op gedeelde hosting mogen die er vaak niet bij
komen, en dan krijg je een melding die nergens naar jouw code wijst:

```
FATAL: An unexpected Turbopack error occurred.
Caused by:
- creating new process
- node process exited before we could connect to it with exit status: 0
```

Dat proces start en stopt meteen weer, zonder uitvoer. Er is geen schakelaar
voor. **De uitweg is een bundelaar die alles in één proces doet**; bij een
serverrenderend framework is dat meestal de oudere bundelaar, niet de nieuwe
standaard.

**Geheugen is begrensd.** Valt de bouw om met een geheugenmelding of een proces
dat op signaal 9 sneuvelt, dan is dát het spoor — niet de laatste wijziging.

**Wat je kunt doen zonder de leverancier te bellen:** veel frameworks hebben
een modus die alleen bundelt en geen pagina's ophaalt. Die is ideaal om een
bouwprobleem te onderzoeken zonder verbruik bij je leverancier.

## 2. Native modules vallen om

Alles wat bij het installeren gecompileerd moet worden is een risico: de
bouwmachine heeft niet altijd dezelfde compiler, en soms mag het script
helemaal niet draaien.

**Vermijd ze waar het kan.** Voor wachtwoorden bijvoorbeeld: de ingebouwde
`scrypt` van Node doet wat een native hashbibliotheek doet, zonder
installatiestap. Zo'n module viel eerder bij de eerste deploy om.

## 3. Symlinks overleven het kopiëren niet altijd

pnpm zet standaard symlinks in `node_modules`, met de echte pakketten in een
map ernaast. Hostingpartijen die elke deploy naar een nieuwe map kopiëren
pakken die symlinks uit — en dan staat een pakket los van de afhankelijkheden
die ernaast hoorden te staan:

```
Cannot find module '@swc/helpers/...' required from node_modules/...
```

**Oplossing:** de installatie plat laten schrijven (`nodeLinker: hoisted`),
zoals npm dat doet. Kost wat schijfruimte, en dat weegt niet op tegen een
winkel die na een deploy niet start.

Let op wáár die instelling hoort: nieuwere pnpm-versies lezen hun eigen
instellingen uit `pnpm-workspace.yaml` en negeren dezelfde regel in `.npmrc`
zonder iets te zeggen. Controleer het met `pnpm config get <sleutel>`.

## 4. Migraties en code lopen uit de pas

Draai je migraties met de hand, dan bestaat er altijd een moment waarop de
database al nieuwe tabellen heeft en de draaiende code ze nog niet kent (of
erger: andersom).

**De volgorde die veilig is:** eerst de migratie die alleen *toevoegt*, dan de
code. Nooit een migratie die een kolom weghaalt vóór de code die hem niet meer
gebruikt.

Hou een script dat de verbinding én het schema nakijkt, en draai dat ná elke
deploy. Een winkel die op mockdata draait ziet er compleet uit, en een
beheerpaneel zonder database ook.

## 5. Wat de database wel en niet kan

Gedeelde MySQL-/MariaDB-accounts hebben beperkingen die nergens gedocumenteerd
staan. `EERDER WAARGENOMEN` op een gedeeld MariaDB-account: **élke uitdrukking in
een gegenereerde kolom** werd geweigerd — ook de simpelste, ook in een nieuwe
tabel.

**De les is algemener dan dat ene geval:** test een onbekende
databasemogelijkheid op een wegwerptabel voordat je er een migratie omheen
bouwt. Vijf minuten meten scheelt een migratie die bij de deploy omvalt.

Wat je altijd nodig hebt en wel werkt: transacties, en een rij vergrendelen om
twee gelijktijdige verzoeken uit elkaar te houden (`SELECT … FOR UPDATE`).
Dat is het gereedschap voor factuurnummers en voor "één keer per klant".

## 6. De firewall van de database

Gedeelde hosting laat verbindingen van buitenaf vaak alleen toe vanaf
IP-adressen die je zelf toevoegt. Dat is een goede beveiliging en een slechte
verrassing op een thuisverbinding met een wisselend adres.

⚠️ **Zet daar nooit een `%` neer** om er vanaf te zijn. Dat opent je database
voor het hele internet.

## 7. Secrets

Zet de sleutels in het paneel of de secret-opslag van de hostingpartij, niet
in een bestand dat je uploadt. De overige regels: `.claude/rules/beveiliging.md`
§ Secrets.

## 8. Geplande taken

Gedeelde hosting biedt vaak alleen cron die een URL aanroept. Eén adres dat
alle dagelijkse taken doet is makkelijker te beheren dan vijf. Beveiliging en
claimen: `.claude/rules/beveiliging.md` § Geplande taken en
`docs/IDEMPOTENCY.md`.

## 9. Wat je vóór de keuze meet

- [ ] Bouwt het framework op de doelomgeving (processen, geheugen)?
- [ ] Werken de dependencies zonder native compilatie, of is die beschikbaar?
- [ ] Overleeft `node_modules` de deploymethode (symlinks)?
- [ ] Welke databasefuncties zijn toegestaan (gegenereerde kolommen,
      `SELECT … FOR UPDATE`, transacties)? Op een wegwerptabel.
- [ ] Hoe draaien migraties, en wie draait ze?
- [ ] Hoe worden backups gemaakt, en is een restore te testen?
      (`docs/DISASTER_RECOVERY.md`)
- [ ] Is de webhook-URL van buitenaf bereikbaar (D-05)?

Elke uitkomst met `GEMETEN` en een datum bij D-00.
