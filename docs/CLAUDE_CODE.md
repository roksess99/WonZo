# Claude Code als control plane

Welke regel waar leeft, en hoe hard hij is. Markdown geeft context, regels
geven richting, beslissingen geven waarheid, hooks geven enforcement, tests
geven bewijs, CI geeft een gate.

Alles hieronder gebruikt alleen gedocumenteerde Claude Code-mechanismen
(`GEDOCUMENTEERD`: code.claude.com/docs — settings, permissions, hooks, memory;
geraadpleegd 2026-10-01). Werkt iets anders in jouw versie: meten, hier
bijwerken.

---

## De onderdelen

```text
CLAUDE.md                     globale instructies, altijd geladen (≤ 200 regels)
  @docs/DECISIONS.md          altijd geladen via import
.claude/rules/*.md            instructies per gebied, laden bij het lezen van
                              een bestand dat matcht op `paths:`
.claude/settings.json         permissies (deny / ask) en hooks — gedeeld via Git
.claude/settings.local.json   persoonlijke aanvullingen — niet in Git
.claude/hooks/guard.mjs       PreToolUse-hook: harde grenzen
.claude/launch.json           dev-servers voor de preview in de desktop-app
scripts/validate-template.mjs consistentie van deze set
scripts/test-guard.mjs        bewijs dat de hook doet wat hij belooft
.github/workflows/            CI voor de template (en later voor de winkel)
```

**Wat je moet weten over laden:**

- Een `@pad`-import in CLAUDE.md laadt **bij de start**, niet op verzoek.
  Daarom importeert CLAUDE.md alleen DECISIONS; de rest wordt met backticks
  genoemd en gelezen wanneer nodig.
- Een regel met `paths:` laadt pas als Claude een matchend bestand **leest**.
  Een nieuw bestand aanmaken laadt hem niet. CLAUDE.md zegt daarom: lees eerst
  het regelbestand van het gebied.
- Kapotte YAML in de frontmatter wordt stil genegeerd en de regel laadt dan
  altijd. De validator controleert de frontmatter.

---

## Instruction, enforcement, validation

| Regel | Instruction | Enforcement | Validation |
|---|---|---|---|
| Geen `.env` lezen of wijzigen | CLAUDE.md | `deny` Read/Edit `.env`, `.env.*` (behalve `.env.example`); hook blokkeert shellverwijzingen | `test-guard` |
| Geen secrets in bestanden | CLAUDE.md, `beveiliging.md` | hook scant geschreven inhoud op sleutelpatronen; `.env.example` alleen lege waarden | `test-guard`; secret scan in CI (`docs/CI_CD.md`) |
| Geen force push / history rewrite | CLAUDE.md § Git | `deny` op de gangbare vormen; hook vangt varianten (`-f`, `+ref`, `:ref`, `--mirror`) | `test-guard` |
| Geen push naar `main` | CLAUDE.md § Git | hook (expliciete refspec, `HEAD`, en kale push vanaf `main`) | branch protection op de remote (`docs/CI_CD.md`) |
| Commit/push alleen na "GO" | CLAUDE.md § Git | `ask` op `git commit`, `git push`, `merge`, `rebase`, `tag` | — |
| Geen dependency zonder te vragen | CLAUDE.md | `ask` op `pnpm add/remove/update/i/install`, `npm install/i`, `yarn add`, en op `npx`, `pnpm dlx`, `yarn dlx` | `pnpm audit` in CI |
| Geen destructieve git | CLAUDE.md | `deny` + hook (`reset --hard`, `clean -f`, `checkout --`, `restore`, `branch -D`, `stash drop`, `add -f`, `--no-verify`) | `test-guard` |
| Niet schrijven buiten het project | CLAUDE.md | hook (projectmap, tijdelijke map en `~/.claude` toegestaan) | `test-guard` |
| Geen productie-acties | CLAUDE.md, `docs/CI_CD.md` | hook blokkeert deploy/infra/productiemigraties | approval-gate in de pipeline |
| Geen destructieve SQL vanuit de shell | `database.md` | hook (`DROP`, `TRUNCATE`, `DELETE` zonder `WHERE`) | migratiereview |
| Geen download-en-uitvoeren | `beveiliging.md` | hook (`curl … \| sh`) | — |
| Geld in integers, server-side berekend | `geld.md` | — (code) | unit tests, lint-regel waar mogelijk |
| Autorisatie server-side | `beveiliging.md` | — (code) | autorisatietests per handeling |
| Leverancier-DTO's blijven in de adapter | `catalogus.md` | — (code) | importgrens in lint (`docs/CI_CD.md`) |
| Documentatie consistent | `docs/AUTHORITY.md` | — | `validate-template.mjs` in CI |

Wat in de kolom enforcement leeg is, kan Claude Code niet afdwingen: dat moet
de code, de lint-configuratie of een test doen. Een regel die alleen als tekst
bestaat terwijl hij wél af te dwingen is, is een gat.

---

## Grenzen van de enforcement

- **Een hook is een vangrail, geen sandbox.** Patroonherkenning op
  shellcommando's is te omzeilen (variabelen, `sh -c`, een script dat zelf een
  bestand opent). Voor isolatie op OS-niveau: de sandbox van Claude Code of een
  container.
- **Read-denyregels gelden voor de bestandstools en herkende shellcommando's**
  (`cat`, `head`, redirects), niet voor een Node- of Python-script dat zelf een
  bestand opent. Daarom blokkeert de hook ook shellverwijzingen naar `.env`.
- **Grep over een hele map** leest `.env` alleen als die niet in `.gitignore`
  staat (ripgrep slaat genegeerde bestanden over). `.env` moet dus in
  `.gitignore` — de template levert dat.
- **Hooks in een project draaien pas na workspace trust.** Vertrouw de map bij
  de eerste start, anders is er geen guard.
- **Faalt de guard zelf** (geen Node, kapotte invoer), dan blokkeert hij. Dat
  is bewust: een kapotte guard mag niet stilletjes geen guard worden.

## Strenger maken (optioneel, keuze van de eigenaar)

- `"permissions": { "disableBypassPermissionsMode": "disable" }` in
  `.claude/settings.json` voorkomt dat iemand de modus zonder prompts gebruikt.
  Deny-regels, ask-regels en hooks gelden ook in die modus; dit is dus een
  extra laag, geen voorwaarde.
- De sandbox (`/sandbox`) voor isolatie van shellcommando's op OS-niveau.

## Onderhoud

- Wijzig je `guard.mjs`: voeg eerst een geval toe aan `scripts/test-guard.mjs`
  dat faalt, dan de fix. Draai `node scripts/test-guard.mjs`.
- Wijzig je CLAUDE.md, rules of docs: draai `node scripts/validate-template.mjs`.
- Een tijdelijke uitzondering hoort in `.claude/settings.local.json` van één
  ontwikkelaar, niet in de gedeelde `settings.json` — en nooit als
  versoepeling van de hook.
