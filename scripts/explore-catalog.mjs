#!/usr/bin/env node
// Explores the supplier catalog (BigBuy, production, read-only) to answer:
// which categories can WonZo sell with the fewest extra legal obligations?
//
// Run by the owner (the token lives in .env, which Claude may not read):
//
//   node --env-file=.env scripts/explore-catalog.mjs            continue / report
//   node --env-file=.env scripts/explore-catalog.mjs --reset    start over
//   node --env-file=.env scripts/explore-catalog.mjs --groups 19656,19661
//
// Resumable. Products, stock and names come from three list endpoints whose
// pages are NOT in the same order (GEMETEN 2026-10-05: joining page 0 of each
// matched 0 of 10 000 names in "Huis en koken"). So every page of every list
// is fetched and stored first, and joined by product id only when a group is
// complete. The limits (10 list calls per hour per endpoint) mean a large
// group takes more than one run: run it again an hour later until it reports
// every group as complete.
//
// Per complete group and subcategory it reports products, active, with
// variations, in stock, refurbished, prices, and a legal class derived from
// the customs code (intrastat / HS) — a triage heuristic; WETTELIJK, to be
// confirmed by an adviser.
//
// Safety: production only, GET only, never an order call. Output: a summary
// on stdout (no token) and data in tmp/catalog-explore/ (ignored by Git).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION = 'https://api.bigbuy.eu';
const DIR = path.join(ROOT, 'tmp', 'catalog-explore');
const PAGES = path.join(DIR, 'pages');
const STATE = path.join(DIR, 'state.json');

const token = process.env.SUPPLIER_API_TOKEN ?? '';
const baseUrl = (process.env.SUPPLIER_BASE_URL ?? '').replace(/\/+$/, '');
if (!token) { console.error('SUPPLIER_API_TOKEN is empty (run with --env-file=.env)'); process.exit(1); }
if (baseUrl !== PRODUCTION) { console.error(`SUPPLIER_BASE_URL must be ${PRODUCTION}: the sandbox has no catalog (GEMETEN 2026-10-05)`); process.exit(1); }

const argv = process.argv.slice(2);
const groupsArg = argv.includes('--groups') ? argv[argv.indexOf('--groups') + 1] : '';
const DEFAULT_GROUPS = [19656, 19661, 19651, 19657, 19654, 19664, 19666, 19756];
const GROUPS = groupsArg ? groupsArg.split(',').map(Number).filter(Boolean) : DEFAULT_GROUPS;
const PAGE = 10000; // documented maximum
// Per run, below the documented hourly limits (10 for lists, 24 for names).
const BUDGET = { products: 9, stock: 9, info: 22, taxonomies: 22 };
const KINDS = {
  products: (g, p) => `/rest/catalog/products.json?parentTaxonomy=${g}&page=${p}&pageSize=${PAGE}`,
  stock: (g, p) => `/rest/catalog/productsstockbyhandlingdays.json?parentTaxonomy=${g}&page=${p}&pageSize=${PAGE}`,
  info: (g, p) => `/rest/catalog/productsinformation.json?isoCode=nl&parentTaxonomy=${g}&page=${p}&pageSize=${PAGE}`,
};
const COMPLIANCE_SAMPLES = 3;

if (argv.includes('--reset')) fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(PAGES, { recursive: true });

// ---------------------------------------------------------------- http

const used = {};
const exhausted = new Set();
const lastCall = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(kind, apiPath, spacingMs = 1500) {
  if (/\/order\//.test(apiPath)) throw new Error('refused: order endpoints are not used here');
  if (exhausted.has(kind)) return { status: 'BUDGET' };
  if (BUDGET[kind] !== undefined && (used[kind] ?? 0) >= BUDGET[kind]) { exhausted.add(kind); return { status: 'BUDGET' }; }
  used[kind] = (used[kind] ?? 0) + 1;
  const wait = (lastCall[kind] ?? 0) + spacingMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall[kind] = Date.now();
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}${apiPath}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(240000),
    });
    const text = await res.text();
    if (res.status === 429) exhausted.add(kind);
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, bytes: text.length, ms: Date.now() - started, reset: res.headers.get('x-ratelimit-reset') };
  } catch (err) {
    return { status: err.name === 'TimeoutError' ? 'TIMEOUT' : 'ERROR', ms: Date.now() - started };
  }
}

// ---------------------------------------------------------------- legal class from HS code

// Heuristic triage. "zwaar": own registration, licence or labelling regime on
// top of GPSR. "licht": an extra labelling rule. "basis": GPSR and consumer
// law only. Every class: WETTELIJK, to be confirmed.
function legalClass(hs) {
  const code = String(hs ?? '').replace(/\D/g, '');
  if (code.length < 4) return ['onbekend', 'onbekend'];
  const c2 = code.slice(0, 2);
  const c4 = code.slice(0, 4);
  const c6 = code.slice(0, 6);
  const n2 = Number(c2);
  if (n2 >= 1 && n2 <= 24) return ['voeding', 'zwaar'];
  if (c2 === '30') return ['medisch', 'zwaar'];
  if (c2 === '33' || c4 === '3401') return ['cosmetica', 'zwaar'];
  if (c4 === '3406') return ['kaarsen', 'basis'];
  if (['28', '29', '31', '32', '34', '35', '36', '37', '38'].includes(c2)) return ['chemisch', 'zwaar'];
  if (c2 === '93') return ['wapens', 'zwaar'];
  if (c4 === '8211') return ['messen (leeftijd en regels controleren)', 'licht'];
  if (c6 === '950450' || c2 === '84' || c2 === '85') return ['elektrisch of machine', 'zwaar'];
  if (c4 === '9405') return ['verlichting', 'zwaar'];
  if (c2 === '91') return ['klokken (vaak batterij)', 'zwaar'];
  if (c2 === '90') return ['optisch, meet of medisch', 'zwaar'];
  if (c4 === '9503' || c4 === '9504') return ['speelgoed', 'zwaar'];
  if (['3924', '4419', '6911', '6912', '7013', '7323', '7615', '8215'].includes(c4)) return ['voedselcontact', 'licht'];
  if (n2 >= 50 && n2 <= 63) return ['textiel', 'licht'];
  if (c4 >= '9401' && c4 <= '9404') return ['meubels', 'basis'];
  if (c2 === '82') return ['handgereedschap', 'basis'];
  if (c4 === '9506') return ['sportartikelen', 'basis'];
  return ['overig', 'basis'];
}

// ---------------------------------------------------------------- state

const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { started: new Date().toISOString(), groups: {} };
const saveState = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
const pageFile = (g, kind, p) => path.join(PAGES, `${g}-${kind}-${p}.json`);
const readPages = (g, kind) => {
  const s = state.groups[g][kind];
  const all = [];
  for (let p = 0; p < s.pages; p++) all.push(...JSON.parse(fs.readFileSync(pageFile(g, kind, p), 'utf8')));
  return all;
};

// ---------------------------------------------------------------- helpers

const out = [];
const line = (s = '') => out.push(s);
const median = (xs) => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  return a.length ? a[Math.floor(a.length / 2)] : null;
};
const eur = (x) => (x === null ? '-' : `€ ${x.toFixed(2).replace('.', ',')}`);
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1).replace('.', ',')}%` : '-');
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

// ---------------------------------------------------------------- fetch

const today = new Date().toISOString().slice(0, 10);
line(`Catalogusverkenning BigBuy — ${today} — productie, alleen lezen — groepen: ${GROUPS.join(', ')}`);
line('Plak dit blok in het gesprek. Het bevat geen token.');
line('');

const taxFile = path.join(DIR, 'taxonomies.json');
if (!fs.existsSync(taxFile)) {
  const t = await get('taxonomies', '/rest/catalog/taxonomies.json?isoCode=nl');
  if (t.status !== 200) { console.error(`taxonomies: HTTP ${t.status}`); process.exit(1); }
  fs.writeFileSync(taxFile, JSON.stringify(t.json));
}
const tax = new Map(JSON.parse(fs.readFileSync(taxFile, 'utf8')).map((t) => [t.id, t]));
const pathOf = (id) => {
  const names = [];
  let cur = tax.get(id);
  for (let guard = 0; cur && guard < 10; guard++) {
    names.unshift(cur.name);
    cur = cur.parentTaxonomy ? tax.get(cur.parentTaxonomy) : null;
  }
  return names.length ? names : [`#${id}`];
};

// Fetch round-robin over groups, so every group makes progress each run.
for (const g of GROUPS) state.groups[g] ??= Object.fromEntries(Object.keys(KINDS).map((k) => [k, { pages: 0, done: false }]));
let progress = true;
while (progress) {
  progress = false;
  for (const g of GROUPS) {
    for (const kind of Object.keys(KINDS)) {
      const s = state.groups[g][kind];
      if (s.done || exhausted.has(kind)) continue;
      const res = await get(kind, KINDS[kind](g, s.pages));
      if (res.status === 'BUDGET' || res.status === 429) continue;
      if (res.status !== 200 || !Array.isArray(res.json)) {
        s.error = `HTTP ${res.status} op pagina ${s.pages}`;
        s.done = true;
        saveState();
        continue;
      }
      fs.writeFileSync(pageFile(g, kind, s.pages), JSON.stringify(res.json));
      s.pages += 1;
      if (res.json.length < PAGE) s.done = true;
      saveState();
      progress = true;
    }
  }
}

// ---------------------------------------------------------------- report

const csv = [['groep', 'subcategorie', 'id', 'sku', 'naam', 'inkoop', 'advies', 'voorraad', 'verwerkingsdagen', 'conditie', 'actief', 'varianten', 'hs', 'klasse', 'zwaarte'].map(csvCell).join(',')];
const complete = [];

for (const g of GROUPS) {
  const s = state.groups[g];
  const groupName = tax.get(g)?.name ?? `#${g}`;
  // Only the list kinds decide completeness; the state also holds GPSR results.
  const status = Object.keys(KINDS).map((k) => `${k} ${s[k].pages} p.${s[k].done ? ' ✓' : ''}${s[k].error ? ` (${s[k].error})` : ''}`).join(', ');
  if (!Object.keys(KINDS).every((k) => s[k].done)) {
    line(`== ${g} ${groupName} — NOG NIET COMPLEET (${status})`);
    continue;
  }
  complete.push(g);
  const products = readPages(g, 'products');
  const stock = new Map(readPages(g, 'stock').map((x) => [x.id, x.stocks ?? []]));
  const names = new Map(readPages(g, 'info').map((x) => [x.id, x.name]));
  const rows = products.map((p) => {
    const st = stock.get(p.id);
    const qty = (st ?? []).reduce((a, x) => a + (x.quantity ?? 0), 0);
    const fastest = (st ?? []).filter((x) => x.quantity > 0).sort((a, b) => a.maxHandlingDays - b.maxHandlingDays)[0];
    const [klass, weight] = legalClass(p.intrastat);
    const sub = pathOf(p.taxonomy);
    return {
      id: p.id, sku: p.sku, name: names.get(p.id) ?? '', sub: sub.slice(1, 3).join(' › ') || sub.join(' › '),
      wholesale: Number(p.wholesalePrice), retail: Number(p.retailPrice), qty, hasStockRow: Boolean(st),
      days: fastest ? `${fastest.minHandlingDays}-${fastest.maxHandlingDays}` : '',
      condition: p.condition ?? '', active: p.active, variations: p.attributes === true,
      hs: p.intrastat ?? '', klass, weight,
    };
  });
  for (const r of rows) csv.push([groupName, r.sub, r.id, r.sku, r.name, r.wholesale, r.retail, r.qty, r.days, r.condition, r.active, r.variations, r.hs, r.klass, r.weight].map(csvCell).join(','));

  const n = rows.length;
  const active = rows.filter((r) => r.active === 1);
  const withVar = rows.filter((r) => r.variations);
  const named = rows.filter((r) => r.name).length;
  const withRow = rows.filter((r) => r.hasStockRow).length;
  const inStock = rows.filter((r) => r.qty > 0 && r.active === 1);
  const sellable = inStock.filter((r) => !/REFURB/i.test(r.condition));
  line(`== ${g} ${groupName} — compleet (${status})`);
  line(`   producten ${n}; actief ${active.length}; met varianten ${withVar.length}; met naam ${named}; met voorraadregel ${withRow}`);
  line(`   op voorraad (actief): ${inStock.length} (${pct(inStock.length, n)}); daarvan nieuw: ${sellable.length}; met varianten en zonder voorraad: ${withVar.filter((r) => r.qty === 0).length}`);
  const byWeight = (list) => ['basis', 'licht', 'zwaar', 'onbekend'].map((w) => `${w} ${list.filter((r) => r.weight === w).length}`).join(' · ');
  line(`   wettelijke zwaarte (nieuw, op voorraad): ${byWeight(sellable)}`);
  line(`   inkoop mediaan: ${eur(median(sellable.map((r) => r.wholesale)))}; advies/inkoop mediaan: ${median(sellable.map((r) => r.retail / r.wholesale))?.toFixed(2) ?? '-'}`);
  const subs = new Map();
  for (const r of sellable) {
    if (!subs.has(r.sub)) subs.set(r.sub, []);
    subs.get(r.sub).push(r);
  }
  line('   subcategorie | nieuw op voorraad | basis/licht/zwaar | inkoop mediaan | voorbeelden');
  for (const [sub, list] of [...subs.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12)) {
    const w = ['basis', 'licht', 'zwaar'].map((k) => list.filter((r) => r.weight === k).length).join('/');
    line(`   ${sub.slice(0, 55)} | ${list.length} | ${w} | ${eur(median(list.map((r) => r.wholesale)))} | ${list.slice(0, 2).map((r) => r.name.slice(0, 40)).join('; ')}`);
  }
  if (!s.gpsrDone) {
    const sample = sellable.filter((r) => r.weight === 'basis').slice(0, COMPLIANCE_SAMPLES);
    s.gpsr = [];
    for (const r of sample) {
      const c = await get('single', `/rest/catalog/productcompliance/${r.id}.json`, 5500);
      const m = c.json?.generalProductSafetyRegulations?.[0];
      s.gpsr.push(`${r.sku}: HTTP ${c.status}; fabrikant: ${m ? `${m.name} (${m.countryIsoCode})` : 'geen'}`);
    }
    s.gpsrDone = true;
    saveState();
  }
  for (const x of s.gpsr ?? []) line(`   GPSR ${x}`);
  line('');
}

fs.writeFileSync(path.join(DIR, 'producten.csv'), '﻿' + csv.join('\n'));
const left = GROUPS.length - complete.length;
line(`Calls deze run: ${JSON.stringify(used)}`);
line(left ? `Nog ${left} groep(en) niet compleet: draai dit script over een uur opnieuw (het gaat verder waar het stopte).` : 'Alle groepen compleet.');
line(`Producten van complete groepen: tmp/catalog-explore/producten.csv (opent in Excel; niet in Git)`);
console.log(out.join('\n'));
