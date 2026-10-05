#!/usr/bin/env node
// Measures what BigBuy charges WonZo to ship to the Netherlands, for the
// products that pass the selection rule (D-02). Input for D-13: a free-shipping
// threshold below the real shipping cost is paid out of the margin.
//
// Run by the owner (the token lives in .env, which Claude may not read), after
// scripts/explore-catalog.mjs has reported every group as complete:
//
//   node --env-file=.env scripts/measure-shipping.mjs             measure / report
//   node --env-file=.env scripts/measure-shipping.mjs --refresh   fetch again
//   node --env-file=.env scripts/measure-shipping.mjs --baskets   also: cost of baskets of several products
//
// One call: GET /rest/shipping/lowest-shipping-costs-by-country/nl
// (GEDOCUMENTEERD: 36 per 6 hours; carriers without proof of delivery are
// excluded; "cost" is a string). The answer is the cheapest cost per product
// shipped ALONE — an order with several products may cost less per product.
// Whether "cost" includes VAT is not documented.
//
// Safety: production only, read-only — GET, plus with --baskets the cost
// calculation POST /rest/shipping/orders, which creates nothing; never an
// /order/ call. Output: a summary
// on stdout (no token) and data in tmp/shipping/ (ignored by Git).

import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION = 'https://api.bigbuy.eu';
const EXPLORE = path.join(ROOT, 'tmp', 'catalog-explore');
const DIR = path.join(ROOT, 'tmp', 'shipping');
const RAW = path.join(DIR, 'nl.json');

const token = process.env.SUPPLIER_API_TOKEN ?? '';
const baseUrl = (process.env.SUPPLIER_BASE_URL ?? '').replace(/\/+$/, '');
if (!token) { console.error('SUPPLIER_API_TOKEN is empty (run with --env-file=.env)'); process.exit(1); }
if (baseUrl !== PRODUCTION) { console.error(`SUPPLIER_BASE_URL must be ${PRODUCTION}: the sandbox has no catalog (GEMETEN 2026-10-05)`); process.exit(1); }
if (!fs.existsSync(path.join(EXPLORE, 'state.json'))) { console.error('Run scripts/explore-catalog.mjs first: this script uses its product lists.'); process.exit(1); }

// The shop's own selection rule, not a copy: the source uses extensionless
// relative imports (Next.js style), which Node resolves with this hook.
registerHooks({
  resolve(specifier, context, next) {
    let result;
    try {
      result = next(specifier, context);
    } catch (err) {
      if (!specifier.startsWith('.')) throw err;
      result = next(`${specifier}.ts`, context);
    }
    // package.json has no "type": say it is an ES module, or Node warns per file.
    return result.url.endsWith('.ts') ? { ...result, format: 'module-typescript' } : result;
  },
});
const { select } = await import(pathToFileURL(path.join(ROOT, 'src', 'lib', 'catalog', 'selection.ts')).href);

// ---------------------------------------------------------------- fetch (one call)

fs.mkdirSync(DIR, { recursive: true });
if (process.argv.includes('--refresh') || !fs.existsSync(RAW)) {
  const started = Date.now();
  const res = await fetch(`${baseUrl}/rest/shipping/lowest-shipping-costs-by-country/nl.json`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(300000),
  });
  const text = await res.text();
  console.log(`GET lowest-shipping-costs-by-country/nl: HTTP ${res.status}, ${text.length} bytes, ${Date.now() - started} ms`);
  if (res.status !== 200) {
    console.log(`Antwoord (eerste 300 tekens): ${text.slice(0, 300)}`);
    process.exit(1);
  }
  fs.writeFileSync(RAW, text);
}
const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
if (!Array.isArray(raw)) { console.error('Unexpected answer: not a list'); process.exit(1); }

// Exact decimal string → cents; null when it is not a plain amount.
const cents = (v) => {
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(String(v ?? '').trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0')) : null;
};
const shipping = new Map();
for (const r of raw) if (r?.reference) shipping.set(String(r.reference), { cost: cents(r.cost), carrier: r.carrierName ?? '?' });

// ---------------------------------------------------------------- selected products

const state = JSON.parse(fs.readFileSync(path.join(EXPLORE, 'state.json'), 'utf8'));
const tax = new Map(JSON.parse(fs.readFileSync(path.join(EXPLORE, 'taxonomies.json'), 'utf8')).map((t) => [t.id, t]));
const pathOf = (id) => {
  const names = [];
  let cur = tax.get(id);
  for (let guard = 0; cur && guard < 10; guard++) {
    names.unshift(cur.name);
    cur = cur.parentTaxonomy ? tax.get(cur.parentTaxonomy) : null;
  }
  return names;
};
const readPages = (g, kind) => {
  const all = [];
  for (let p = 0; p < state.groups[g][kind].pages; p++) all.push(...JSON.parse(fs.readFileSync(path.join(EXPLORE, 'pages', `${g}-${kind}-${p}.json`), 'utf8')));
  return all;
};

const selected = [];
for (const g of Object.keys(state.groups)) {
  const s = state.groups[g];
  if (!['products', 'stock', 'info'].every((k) => s[k]?.done)) continue;
  const stock = new Map(readPages(g, 'stock').map((x) => [x.id, (x.stocks ?? []).reduce((a, y) => a + (y.quantity ?? 0), 0)]));
  const names = new Map(readPages(g, 'info').map((x) => [x.id, x.name ?? '']));
  for (const p of readPages(g, 'products')) {
    const verdict = select({
      taxonomyPath: pathOf(p.taxonomy),
      hs: p.intrastat ?? null,
      names: [names.get(p.id) ?? ''],
      condition: p.condition ?? '',
      active: p.active === 1,
      stock: stock.get(p.id) ?? 0,
      hasManufacturer: true, // not known per product here; checked per product in the shop
      hasShippingCost: shipping.get(String(p.sku))?.cost !== null && shipping.has(String(p.sku)),
    });
    if (!verdict.allowed) continue;
    selected.push({ sku: String(p.sku), sub: `${verdict.categoryKey}/${verdict.subcategoryKey}`, retail: cents(p.retailPrice), ship: shipping.get(String(p.sku)) });
  }
}

// ---------------------------------------------------------------- report

const eur = (c) => (c === null || c === undefined ? '-' : `€ ${(c / 100).toFixed(2).replace('.', ',')}`);
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');
const q = (xs, f) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor(f * a.length))] : null;
};
const out = [];
const line = (s = '') => out.push(s);

line(`Verzendkosten BigBuy naar Nederland — ${new Date().toISOString().slice(0, 10)} — productie, alleen lezen`);
line('Plak dit blok in het gesprek. Het bevat geen token.');
line('');
line(`Regels in het antwoord: ${raw.length}; met een bruikbaar bedrag: ${[...shipping.values()].filter((x) => x.cost !== null).length}`);
line(`Voorbeeld van één regel: ${JSON.stringify(raw[0] ?? null)}`);
const withCost = selected.filter((r) => r.ship?.cost !== null && r.ship?.cost !== undefined);
line(`Producten door de selectieregel (D-02, zonder GPSR-controle): ${selected.length}; met verzendkosten: ${withCost.length}`);
const costs = withCost.map((r) => r.ship.cost);
line(`Verzendkosten per los product — min ${eur(q(costs, 0))} · 25% ${eur(q(costs, 0.25))} · mediaan ${eur(q(costs, 0.5))} · 75% ${eur(q(costs, 0.75))} · 90% ${eur(q(costs, 0.9))} · max ${eur(q(costs, 1))}`);
const carriers = new Map();
for (const r of withCost) carriers.set(r.ship.carrier, (carriers.get(r.ship.carrier) ?? 0) + 1);
line(`Vervoerders: ${[...carriers.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(' · ')}`);
line('');
line('Per prijsklasse (adviesprijs zoals BigBuy hem geeft; incl. of excl. btw is nog niet bevestigd):');
line('   klasse | producten | verzendkosten mediaan | verzendkosten als deel van de prijs (mediaan)');
for (const [lo, hi] of [[0, 1500], [1500, 2500], [2500, 5000], [5000, 10000], [10000, Infinity]]) {
  const band = withCost.filter((r) => r.retail !== null && r.retail >= lo && r.retail < hi);
  const share = band.map((r) => r.ship.cost / r.retail);
  line(`   ${eur(lo)} – ${hi === Infinity ? 'meer' : eur(hi)} | ${band.length} | ${eur(q(band.map((r) => r.ship.cost), 0.5))} | ${share.length ? pct(q(share, 0.5), 1) : '-'}`);
}
line('');
line('Per subcategorie: producten | verzendkosten mediaan | 90%');
const subs = new Map();
for (const r of withCost) subs.set(r.sub, [...(subs.get(r.sub) ?? []), r.ship.cost]);
for (const [sub, list] of [...subs.entries()].sort((a, b) => b[1].length - a[1].length)) line(`   ${sub} | ${list.length} | ${eur(q(list, 0.5))} | ${eur(q(list, 0.9))}`);
line('');
line('Drempel → deel van de producten dat er in z\'n eentje al boven zit:');
for (const t of [2500, 3500, 5000, 7000]) line(`   ${eur(t)}: ${pct(withCost.filter((r) => r.retail !== null && r.retail >= t).length, withCost.length)}`);

fs.writeFileSync(path.join(DIR, 'geselecteerd.csv'), '﻿' + ['sku,subcategorie,advies_cent,verzend_cent,vervoerder', ...selected.map((r) => [r.sku, r.sub, r.retail ?? '', r.ship?.cost ?? '', r.ship?.carrier ?? ''].join(','))].join('\n'));
line('');
line('Per product: tmp/shipping/geselecteerd.csv (opent in Excel; niet in Git)');

// ---------------------------------------------------------------- --baskets: several products in one order

// The list above is the cost per product shipped ALONE. Whether a basket
// costs the sum or one parcel decides how a free-shipping threshold works.
// POST /rest/shipping/orders computes the cost of a basket; it places no
// order (GEDOCUMENTEERD: "Get shipping costs for an order"; 1 per second).
if (process.argv.includes('--baskets')) {
  // The company's own postcode (given by the owner, 2026-10-05), not a customer's.
  const delivery = { isoCountry: 'nl', postCode: '6846XX' };
  const small = withCost.filter((r) => r.ship.cost === q(costs, 0) && r.sub.startsWith('wonen/')).sort((a, b) => a.sku.localeCompare(b.sku));
  const furniture = withCost.filter((r) => r.sub === 'wonen/meubels').sort((a, b) => a.ship.cost - b.ship.cost)[0];
  const [s1, s2, s3, s4, s5] = small;
  const baskets = [
    ['1 klein product', [[s1, 1]]],
    ['hetzelfde product 2×', [[s1, 2]]],
    ['hetzelfde product 3×', [[s1, 3]]],
    ['2 verschillende kleine', [[s1, 1], [s2, 1]]],
    ['3 verschillende kleine', [[s1, 1], [s2, 1], [s3, 1]]],
    ['5 verschillende kleine', [[s1, 1], [s2, 1], [s3, 1], [s4, 1], [s5, 1]]],
    ['1 meubel', [[furniture, 1]]],
    ['1 meubel + 1 klein', [[furniture, 1], [s1, 1]]],
  ].filter(([, items]) => items.every(([r]) => r));

  line('');
  line(`Manden (POST shipping/orders, naar ${delivery.isoCountry.toUpperCase()} ${delivery.postCode}; geen bestelling):`);
  line('   mand | som van losse kosten | kosten van de mand | goedkoopste vervoerder | gewicht');
  for (const [label, items] of baskets) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(`${baseUrl}/rest/shipping/orders.json`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: { delivery, products: items.map(([r, quantity]) => ({ reference: r.sku, quantity })) } }),
      signal: AbortSignal.timeout(60000),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    const sum = items.reduce((a, [r, n]) => a + r.ship.cost * n, 0);
    const options = (Array.isArray(json) ? json : [json]).flatMap((s) => s?.shippingOptions ?? []).filter((o) => typeof o?.cost === 'number');
    const best = options.sort((a, b) => a.cost - b.cost)[0];
    line(`   ${label} (${items.map(([r, n]) => `${r.sku}×${n}`).join(', ')}) | ${eur(sum)} | ${res.status === 200 && best ? eur(Math.round(best.cost * 100)) : `HTTP ${res.status} ${text.slice(0, 120)}`} | ${best?.shippingService?.name ?? '-'} | ${best?.weight ?? '-'}`);
  }
}
console.log(out.join('\n'));
