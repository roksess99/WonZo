#!/usr/bin/env node
// Measures the supplier API (BigBuy) for docs/api/LEVERANCIER.md.
//
// Run by the owner, not by Claude (the token lives in .env, which Claude may
// not read):
//
//   node --env-file=.env scripts/measure-supplier.mjs
//   node --env-file=.env scripts/measure-supplier.mjs --production   (read-only)
//
// Safety:
// - Sandbox only by default. With --production only GET requests are made.
// - Never places an order: order/create and upload_invoice are refused in code.
//   The only POST is order/check, which BigBuy documents as a simulation.
// - Never prints the token. Raw responses go to tmp/supplier-measure/ (ignored
//   by Git); stdout is a summary that is safe to paste into the conversation.
// - Respects the documented rate limits by spacing calls. Bulk endpoints allow
//   10 calls per hour; do not run this more than once per hour.
//
// Dependency-free (Node 20.6+ for --env-file).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'tmp', 'supplier-measure');
const SANDBOX = 'https://api.sandbox.bigbuy.eu';
const PRODUCTION = 'https://api.bigbuy.eu';

const args = new Set(process.argv.slice(2));
const allowProduction = args.has('--production');

const token = process.env.SUPPLIER_API_TOKEN ?? '';
const baseUrl = (process.env.SUPPLIER_BASE_URL ?? '').replace(/\/+$/, '');
const language = process.env.SUPPLIER_LANGUAGE || 'nl';

function stop(msg) {
  console.error(`measure-supplier: ${msg}`);
  process.exit(1);
}

if (!token) stop('SUPPLIER_API_TOKEN is empty. Fill it in .env and run with: node --env-file=.env scripts/measure-supplier.mjs');
if (!baseUrl) stop(`SUPPLIER_BASE_URL is empty. Use ${SANDBOX} (test) first.`);
if (baseUrl !== SANDBOX && baseUrl !== PRODUCTION) stop(`SUPPLIER_BASE_URL must be ${SANDBOX} or ${PRODUCTION}, got ${baseUrl}`);
const isProduction = baseUrl === PRODUCTION;
if (isProduction && !allowProduction) stop('SUPPLIER_BASE_URL points to production. Pass --production to run the read-only measurements there.');

// ---------------------------------------------------------------- http

const FORBIDDEN = [/\/order\/create/i, /upload_invoice/i];
// Minimum spacing per endpoint family, from the documented limits.
const SPACING_MS = { single: 5500, order: 1200, bulk: 1500, image: 300 };
const lastCall = {};
const calls = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(family, method, apiPath, body) {
  if (FORBIDDEN.some((re) => re.test(apiPath))) throw new Error(`refused: ${apiPath} would place a real order`);
  if (method !== 'GET' && isProduction) throw new Error(`refused: ${method} ${apiPath} in production (read-only)`);
  const wait = (lastCall[family] ?? 0) + SPACING_MS[family] - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall[family] = Date.now();

  const url = family === 'image' ? apiPath : `${baseUrl}${apiPath}`;
  const headers = family === 'image' ? {} : { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  const started = performance.now();
  const record = { family, method, path: family === 'image' ? new URL(url).host + '/…' : apiPath };
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(family === 'bulk' ? 60000 : 20000),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    record.status = res.status;
    record.durationMs = Math.round(performance.now() - started);
    record.bytes = buf.length;
    record.contentType = res.headers.get('content-type');
    record.rateLimit = Object.fromEntries([...res.headers].filter(([k]) => /ratelimit|retry-after/i.test(k)));
    record.location = res.headers.get('location') ?? undefined;
    if (family !== 'image') {
      const text = buf.toString('utf8');
      try {
        record.json = JSON.parse(text);
      } catch {
        record.notJson = text.slice(0, 200);
      }
    }
  } catch (err) {
    record.error = err.name === 'TimeoutError' ? 'TIMEOUT' : String(err.message ?? err);
    record.durationMs = Math.round(performance.now() - started);
  }
  calls.push(record);
  return record;
}

// ---------------------------------------------------------------- helpers

const report = [];
const line = (s = '') => report.push(s);
const types = (obj) => (obj && typeof obj === 'object' ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v])) : {});
const brief = (r) => `HTTP ${r.status ?? '-'}${r.error ? ` ${r.error}` : ''}, ${r.durationMs} ms, ${r.bytes ?? 0} bytes${r.notJson ? ', GEEN JSON' : ''}`;
const list = (r) => (Array.isArray(r.json) ? r.json : []);

// ---------------------------------------------------------------- measurements

const today = new Date().toISOString().slice(0, 10);
const env = isProduction ? 'productie (api.bigbuy.eu), alleen lezen' : 'sandbox (api.sandbox.bigbuy.eu)';
line(`Meting leverancier-API — ${today} — omgeving: ${env} — taal: ${language}`);
line('Plak dit hele blok in het gesprek. Het bevat geen token.');
line('');

// §1 token
const auth = await request('order', 'GET', '/rest/user/auth/status.json');
line(`§1 Token — auth/status: ${brief(auth)}; antwoord: ${JSON.stringify(auth.json ?? auth.notJson ?? null).slice(0, 200)}`);
if (auth.status === 401 || auth.status === 403) {
  line('   Token geweigerd; verdere metingen overgeslagen.');
} else {
  // §9 languages
  const langs = await request('bulk', 'GET', '/rest/catalog/languages.json');
  const isoCodes = list(langs).map((l) => l.isoCode ?? l.iso_code ?? l.code).filter(Boolean);
  line(`§9 Talen: ${brief(langs)}; isoCodes: ${isoCodes.join(', ') || JSON.stringify(langs.json).slice(0, 200)}; "${language}" aanwezig: ${isoCodes.includes(language) ? 'ja' : 'nee/onbekend'}`);

  // §2 taxonomies, and stability across runs
  const tax = await request('bulk', 'GET', `/rest/catalog/taxonomies.json?isoCode=${language}&firstLevel=1`);
  const taxItems = list(tax);
  line(`§2 Taxonomieën (eerste niveau, ${language}): ${brief(tax)}; aantal: ${taxItems.length}; voorbeeld: ${JSON.stringify(taxItems.slice(0, 3))}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // One file per environment: sandbox and production ids differ (GEMETEN 2026-10-05).
  const taxFile = path.join(OUT_DIR, `taxonomies-previous-${isProduction ? 'production' : 'sandbox'}.json`);
  if (taxItems.length) {
    const current = Object.fromEntries(taxItems.map((t) => [t.id, t.name]));
    if (fs.existsSync(taxFile)) {
      const prev = JSON.parse(fs.readFileSync(taxFile, 'utf8'));
      const changed = Object.keys(current).filter((id) => id in prev.map && prev.map[id] !== current[id]);
      const gone = Object.keys(prev.map).filter((id) => !(id in current));
      line(`   Vergeleken met de meting van ${prev.date}: ${changed.length} id's met een andere naam, ${gone.length} verdwenen. ${changed.slice(0, 5).map((id) => `${id}: "${prev.map[id]}" → "${current[id]}"`).join('; ')}`);
    } else {
      line('   Eerste meting: id\'s bewaard; een volgende run (dagen later) toont of ze stabiel zijn.');
    }
    fs.writeFileSync(taxFile, JSON.stringify({ date: today, map: current }, null, 1));
  }

  // §2/§4/§5. Run 1 (2026-10-05): every product list without parentTaxonomy
  // gave HTTP 400. Lists are now scoped to one first-level taxonomy, chosen by
  // name close to the WonZo assortment. If paging still fails, one call
  // without paging tells whether the sandbox has a catalog at all.
  const taxChoice = taxItems.find((t) => /elektron|huis|keuken|wonen/i.test(t.name ?? '')) ?? taxItems[0];
  const taxId = taxChoice?.id;
  line(`§2 Gekozen hoofdgroep voor de lijsten: ${taxId} "${taxChoice?.name ?? '-'}"`);
  let q = (paging) => `parentTaxonomy=${taxId}${paging ? `&${paging}` : ''}`;
  const p0 = await request('bulk', 'GET', `/rest/catalog/products.json?${q('page=0&pageSize=10')}`);
  let p1 = { status: '-', durationMs: 0 };
  let pagingWorks = p0.status === 200;
  if (pagingWorks) {
    p1 = await request('bulk', 'GET', `/rest/catalog/products.json?${q('page=1&pageSize=10')}`);
    // Does the full catalog page without a taxonomy? Decides how D-31 syncs.
    const noTax = await request('bulk', 'GET', '/rest/catalog/products.json?page=0&pageSize=10');
    line(`§2 Zonder hoofdgroep (page=0&pageSize=10): ${brief(noTax)}; aantal: ${list(noTax).length}; antwoord bij fout: ${noTax.status === 200 ? '-' : JSON.stringify(noTax.json ?? noTax.notJson ?? null).slice(0, 120)}`);
  } else {
    const bare = await request('bulk', 'GET', `/rest/catalog/products.json?${q('')}`);
    line(`§2/§4 Met hoofdgroep, page=0&pageSize=10: ${brief(p0)}; antwoord: ${JSON.stringify(p0.json ?? p0.notJson ?? null).slice(0, 120)}`);
    line(`§2/§4 Met hoofdgroep, zonder paginering: ${brief(bare)}; aantal: ${list(bare).length}`);
    line(`   Duiding: ${bare.status === 200 ? 'paginering met page=0 wordt geweigerd; de hoofdgroep zonder paginering werkt' : 'ook met hoofdgroep geweigerd → vermoedelijk heeft de sandbox geen catalogus; meten in productie (alleen lezen)'}`);
    if (bare.status === 200) {
      // Use the working form for the rest of the run; reuse its data.
      p0.json = bare.json;
      q = () => `parentTaxonomy=${taxId}`;
    }
  }
  const ids0 = list(p0).map((p) => p.id);
  const ids1 = list(p1).map((p) => p.id);
  const overlap = ids0.filter((id) => ids1.includes(id)).length;
  if (pagingWorks) {
    line(`§2/§4 Producten in hoofdgroep ${taxId}: page=0 → ${brief(p0)}, ${ids0.length} stuks; page=1 → ${brief(p1)}, ${ids1.length} stuks; overlap: ${overlap}`);
    line(`   Duiding: ${ids0.length === 0 && ids1.length ? 'page=0 leeg → telling begint bij 1' : overlap === ids0.length && ids0.length ? 'page=0 en page=1 gelijk → 0 wordt als 1 behandeld' : overlap === 0 && ids0.length && ids1.length ? 'disjunct → telling begint bij 0' : 'onduidelijk, zie ruwe data'}`);
  }
  line(`   Veldtypes product (lijst): ${JSON.stringify(types(list(p0)[0]))}`);
  if (pagingWorks) {
    const big = await request('bulk', 'GET', `/rest/catalog/products.json?${q('page=0&pageSize=1000')}`);
    line(`§5 Omvang bij pageSize=1000: ${brief(big)}; aantal: ${list(big).length}; ≈ ${list(big).length ? Math.round(big.bytes / list(big).length) : '-'} bytes per product`);
  } else if (list(p0).length) {
    const bareCall = calls.at(-1);
    line(`§5 Omvang van de hele hoofdgroep: ${bareCall.bytes} bytes voor ${list(p0).length} producten`);
  }

  // §6 prices
  const prices = await request('bulk', 'GET', `/rest/catalog/productprices.json?${q('page=0&pageSize=10')}`);
  const pr = list(prices);
  line(`§6 Prijzen: ${brief(prices)}; veldtypes: ${JSON.stringify(types(pr[0]))}`);
  for (const p of pr.slice(0, 3)) {
    line(`   sku ${p.sku}: wholesalePrice ${JSON.stringify(p.wholesalePrice)}, retailPrice ${JSON.stringify(p.retailPrice)}, inShopsPrice ${JSON.stringify(p.inShopsPrice)}, retail/wholesale ${p.wholesalePrice ? (Number(p.retailPrice) / Number(p.wholesalePrice)).toFixed(3) : '-'}`);
  }
  line('   Controle incl./excl. btw: zoek deze sku\'s op in het BigBuy-account en vergelijk met een schermafdruk (zie ook § 10 hieronder).');

  // single product: does the same field come back as a string?
  if (ids0[0] !== undefined) {
    const one = await request('single', 'GET', `/rest/catalog/product/${ids0[0]}.json`);
    line(`§6 Eén product (${ids0[0]}): ${brief(one)}; wholesalePrice ${JSON.stringify(one.json?.wholesalePrice)} (${typeof one.json?.wholesalePrice}), retailPrice ${JSON.stringify(one.json?.retailPrice)} (${typeof one.json?.retailPrice}), taxRate ${JSON.stringify(one.json?.taxRate)}, canon ${JSON.stringify(one.json?.canon)}`);
  }

  // §8 / D-34: what the compliance endpoint returns (energy label, GPSR)
  if (ids0[0] !== undefined) {
    const comp = await request('single', 'GET', `/rest/catalog/productcompliance/${ids0[0]}.json`);
    line(`§8/D-34 Compliance (${ids0[0]}): ${brief(comp)}; velden: ${JSON.stringify(types(Array.isArray(comp.json) ? comp.json[0] : comp.json))}; inhoud: ${JSON.stringify(comp.json ?? comp.notJson ?? null).slice(0, 400)}`);
  }

  // §7 stock per warehouse
  const stock = await request('bulk', 'GET', `/rest/catalog/productsstockbyhandlingdays.json?${q('page=0&pageSize=50')}`);
  const st = list(stock);
  const multi = st.filter((s) => (s.stocks ?? []).length > 1).length;
  const warehouses = new Set(st.flatMap((s) => (s.stocks ?? []).map((x) => x.warehouse)));
  const days = st.flatMap((s) => (s.stocks ?? []).map((x) => `${x.minHandlingDays}-${x.maxHandlingDays}`));
  line(`§7 Voorraad: ${brief(stock)}; ${st.length} producten, ${multi} met meer dan één voorraadregel; magazijnen: ${[...warehouses].join(', ')}; levertijden (dagen): ${[...new Set(days)].join(', ')}`);
  line(`   Voorbeeld: ${JSON.stringify(st.slice(0, 2))}`);

  // §8 images
  const imgs = await request('bulk', 'GET', `/rest/catalog/productsimages.json?${q('page=0&pageSize=10')}`);
  const allImgs = list(imgs).flatMap((p) => p.images ?? []);
  const hosts = new Set(allImgs.map((i) => { try { return new URL(i.url).host; } catch { return 'ongeldige url'; } }));
  line(`§8 Afbeeldingen: ${brief(imgs)}; ${allImgs.length} foto's bij ${list(imgs).length} producten; domeinen: ${[...hosts].join(', ')}`);
  const flag = (k) => allImgs.filter((i) => i[k] === true || Number(i[k]) > 0).length;
  line(`   Vlaggen (D-34): energyEfficiency ${flag('energyEfficiency')}, gpsrLabel ${flag('gpsrLabel')}, gpsrWarning ${flag('gpsrWarning')} van ${allImgs.length} foto's`);
  const sizes = [];
  for (const img of allImgs.slice(0, 4)) {
    const r = await request('image', 'GET', img.url);
    sizes.push(r.bytes);
    line(`   foto ${img.id}: ${brief(r)}, ${r.contentType}`);
  }
  if (sizes.length > 1) line(`   Allemaal even groot (generieke plaatshouder?): ${new Set(sizes).size === 1 ? 'ja' : 'nee'}`);

  // §9 names in the shop language
  const info = await request('bulk', 'GET', `/rest/catalog/productsinformation.json?isoCode=${language}&${q('page=0&pageSize=10')}`);
  const inf = list(info);
  line(`§9 Productinformatie (${language}): ${brief(info)}; ${inf.length} stuks, ${inf.filter((i) => i.name).length} met naam; voorbeelden: ${inf.slice(0, 3).map((i) => JSON.stringify(i.name)).join(', ')}`);

  // §10 ordering
  const purse = await request('order', 'GET', '/rest/user/purse.json');
  line(`§10 Tegoed (moneybox): ${brief(purse)}; ${JSON.stringify(purse.json ?? purse.notJson ?? null).slice(0, 120)}`);
  const carriers = await request('order', 'GET', '/rest/shipping/carriers.json');
  line(`§10 Vervoerders: ${brief(carriers)}; ${list(carriers).map((c) => c.name ?? c.id).slice(0, 15).join(', ') || JSON.stringify(carriers.json).slice(0, 200)}`);
  const missing = await request('order', 'GET', `/rest/order/reference/WONZO-MEASURE-DOES-NOT-EXIST-${Date.now()}.json`);
  line(`§10 Opzoeken onbekende eigen referentie: ${brief(missing)}; antwoord: ${JSON.stringify(missing.json ?? missing.notJson ?? null).slice(0, 200)}`);

  const inStock = st.find((s) => (s.stocks ?? []).some((x) => x.quantity > 0));
  if (isProduction) {
    line('§10 order/check overgeslagen: productie is alleen lezen.');
  } else if (!inStock) {
    line('§10 order/check overgeslagen: geen product met voorraad gevonden in de steekproef.');
  } else {
    // Fictitious address and contact data: this is a simulation in the sandbox.
    const check = await request('order', 'POST', '/rest/order/check.json', {
      order: {
        internalReference: `WONZO-MEASURE-${Date.now()}`,
        language,
        paymentMethod: 'moneybox',
        shippingAddress: {
          firstName: 'Test',
          lastName: 'Meting',
          country: 'NL',
          postcode: '1011AB',
          town: 'Amsterdam',
          address: 'Teststraat 1',
          phone: '0201234567',
          email: 'test@example.com',
        },
        products: [{ reference: inStock.sku, quantity: 1 }],
      },
    });
    const price = pr.find((p) => p.sku === inStock.sku);
    line(`§10 order/check (simulatie, sku ${inStock.sku}, 1 stuk, moneybox, NL): ${brief(check)}; antwoord: ${JSON.stringify(check.json ?? check.notJson ?? null).slice(0, 300)}`);
    if (price) line(`   wholesalePrice van deze sku: ${price.wholesalePrice} — gelijk aan totalWithoutTaxesAndWithoutShippingCost? Dan is de inkoopprijs excl. btw.`);
    else line('   (sku niet in de prijssteekproef; vergelijk het bedrag met de prijs in het BigBuy-account)');
  }
}

// §11 errors and limits, across all calls
const statuses = calls.reduce((acc, c) => ((acc[c.status ?? c.error] = (acc[c.status ?? c.error] ?? 0) + 1), acc), {});
const rl = calls.find((c) => c.rateLimit && Object.keys(c.rateLimit).length)?.rateLimit;
const durations = calls.filter((c) => c.family !== 'image' && c.durationMs).map((c) => c.durationMs).sort((a, b) => a - b);
const pct = (q) => durations[Math.min(durations.length - 1, Math.floor(q * durations.length))];
line(`§11 Statuscodes: ${JSON.stringify(statuses)}; rate-limit-headers (voorbeeld): ${JSON.stringify(rl ?? {})}; latentie API-calls p50 ${pct(0.5)} ms, p95 ${pct(0.95)} ms (${durations.length} calls — klein, geen statistiek)`);
const notJson = calls.filter((c) => c.notJson);
if (notJson.length) line(`   Antwoorden zonder JSON: ${notJson.map((c) => `${c.path} (${c.contentType})`).join(', ')}`);
line('');
line(`Calls deze run: ${calls.filter((c) => c.family === 'bulk').length} bulk, ${calls.filter((c) => c.family === 'single').length} enkel, ${calls.filter((c) => c.family === 'order').length} order/user/shipping, ${calls.filter((c) => c.family === 'image').length} foto's. Niet vaker dan eens per uur draaien.`);

fs.mkdirSync(OUT_DIR, { recursive: true });
const rawFile = path.join(OUT_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(rawFile, JSON.stringify({ date: today, environment: env, calls }, null, 1));
line(`Ruwe antwoorden: ${path.relative(ROOT, rawFile).split(path.sep).join('/')} (niet in Git)`);

console.log(report.join('\n'));
