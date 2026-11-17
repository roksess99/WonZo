#!/usr/bin/env node
// Measures Mollie in test mode for D-05 ("nog te meten in testmodus").
//
// Run by the owner, not by Claude (the key lives in .env, which Claude may
// not read):
//
//   node --env-file=.env scripts/measure-mollie.mjs
//   node --env-file=.env scripts/measure-mollie.mjs --status tr_xxxxxxxx
//
// The first form:
//   1. which methods the key can use (GET /v2/methods), with their status;
//   2. a payment of € 1,00 with the same body as the shop sends
//      (src/lib/payments/mollie.ts, createPayment), with an Idempotency-Key;
//   3. the same key and the same body again: the same payment back?
//   4. the same key with another amount: what does Mollie answer?
//   5. the payment read back: status, created, expires (the real expiry time).
// It prints the test payment page: open it, pick a status (paid, failed,
// canceled, expired), then run the second form to see what Mollie reports.
//
// Safety:
// - Test keys only (test_…): a live key is refused before anything is sent.
// - Never prints the key. Stdout is safe to paste into the conversation; raw
//   answers go to tmp/mollie-measure/ (ignored by Git).
// - No webhook URL: Mollie cannot reach localhost, and the webhook order is
//   measured later on a reachable address.
//
// Dependency-free (Node 20.6+ for --env-file).

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'tmp', 'mollie-measure');
const API = 'https://api.mollie.com/v2';
// The same list as METHODS in src/lib/payments/mollie.ts.
const METHODS = ['ideal', 'applepay', 'creditcard'];

function stop(msg) {
  console.error(`measure-mollie: ${msg}`);
  process.exit(1);
}

const key = (process.env.MOLLIE_API_KEY ?? '').trim();
if (!key) stop('MOLLIE_API_KEY is empty. Put the test key in .env and run: node --env-file=.env scripts/measure-mollie.mjs');
if (!/^test_[A-Za-z0-9]{20,}$/.test(key)) stop('MOLLIE_API_KEY is not a test key (test_…). This script only runs in test mode.');

const argv = process.argv.slice(2);
const statusOf = argv[0] === '--status' ? argv[1] : null;
if (argv[0] === '--status' && !/^tr_[A-Za-z0-9]{4,30}$/.test(statusOf ?? '')) stop('Usage: --status tr_xxxxxxxx');

fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
let n = 0;
function keep(name, body) {
  n += 1;
  fs.writeFileSync(path.join(OUT_DIR, `${stamp}-${String(n).padStart(2, '0')}-${name}.json`), JSON.stringify(body, null, 2));
}

async function call(method, apiPath, body, idempotencyKey) {
  const started = Date.now();
  const res = await fetch(`${API}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ms: Date.now() - started, json };
}

const detail = (j) => (j && typeof j.detail === 'string' ? j.detail.slice(0, 200) : '');
const field = (j, k) => (j && j[k] !== undefined ? j[k] : '—');

function showPayment(label, r) {
  const j = r.json ?? {};
  console.log(`${label}: HTTP ${r.status} in ${r.ms} ms`);
  if (r.status >= 400) {
    console.log(`  refused: ${detail(j)} (field: ${field(j, 'field')})`);
    return;
  }
  for (const k of ['id', 'mode', 'status', 'method', 'createdAt', 'expiresAt', 'paidAt', 'canceledAt', 'expiredAt', 'failedAt']) {
    if (j[k] !== undefined && j[k] !== null) console.log(`  ${k}: ${j[k]}`);
  }
  if (j.amount) console.log(`  amount: ${j.amount.value} ${j.amount.currency}`);
  if (j.createdAt && j.expiresAt) console.log(`  expires after: ${Math.round((Date.parse(j.expiresAt) - Date.parse(j.createdAt)) / 60_000)} min`);
}

// No process.exit() after a request: on Windows, exiting while fetch still
// closes its connection trips an assertion in Node (seen 2026-11-13). The
// script ends by itself instead.
async function status(id) {
  const r = await call('GET', `/payments/${id}`);
  keep('status', r.json);
  showPayment('Payment', r);
}

async function measure() {
console.log(`Mollie test mode — ${new Date().toISOString()}\n`);

// 1. Methods
const m = await call('GET', '/methods?includeWallets=applepay');
keep('methods', m.json);
console.log(`1. Methods: HTTP ${m.status} in ${m.ms} ms`);
if (m.status >= 400) {
  console.error(`measure-mollie: Mollie refused the key: ${detail(m.json)}`);
  process.exitCode = 1;
  return;
}
const list = m.json?._embedded?.methods ?? [];
for (const x of list) console.log(`  ${x.id}: ${x.status ?? '(no status)'}`);
for (const want of METHODS) if (!list.some((x) => x.id === want)) console.log(`  ${want}: NOT in the list`);

// 2. A payment, the shop's body
const body = (cents) => ({
  amount: { currency: 'EUR', value: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}` },
  description: 'WonZo meting testmodus',
  redirectUrl: 'https://wonzo.nl/',
  locale: 'nl_NL',
  method: METHODS,
  metadata: { measurement: true },
});
const idem = randomUUID();
console.log('');
const a = await call('POST', '/payments', body(100), idem);
keep('create', a.json);
showPayment('2. Create (€ 1,00, the shop\'s body)', a);

let paymentId = a.status < 400 ? a.json.id : null;
if (!paymentId) {
  // Find out whether one method in the list is what Mollie refuses.
  const b = await call('POST', '/payments', { ...body(100), method: METHODS.filter((x) => x !== 'applepay') }, randomUUID());
  keep('create-without-applepay', b.json);
  showPayment('2b. Create without applepay', b);
  paymentId = b.status < 400 ? b.json.id : null;
}

if (a.status < 400) {
  // 3. Same key, same body
  const same = await call('POST', '/payments', body(100), idem);
  keep('same-key-same-body', same.json);
  console.log(`\n3. Same key, same body: HTTP ${same.status} in ${same.ms} ms — ${same.json?.id === a.json.id ? 'the SAME payment' : `another answer (${same.json?.id ?? detail(same.json)})`}`);

  // 4. Same key, other amount
  const other = await call('POST', '/payments', body(200), idem);
  keep('same-key-other-body', other.json);
  console.log(`4. Same key, € 2,00: HTTP ${other.status} in ${other.ms} ms — ${other.status >= 400 ? `refused: ${detail(other.json)}` : other.json?.id === a.json.id ? `the FIRST payment back (amount ${other.json?.amount?.value})` : `a NEW payment ${other.json?.id}`}`);
}

if (paymentId) {
  // 5. Read back
  console.log('');
  const g = await call('GET', `/payments/${paymentId}`);
  keep('read', g.json);
  showPayment('5. Read back', g);
  const href = g.json?._links?.checkout?.href;
  console.log(`\nNext: open the test payment page, pick a status, then run`);
  console.log(`  node --env-file=.env scripts/measure-mollie.mjs --status ${paymentId}`);
  if (href) console.log(`Test payment page: ${href}`);
}
console.log(`\nRaw answers: tmp/mollie-measure/${stamp}-*.json`);
}

await (statusOf ? status(statusOf) : measure());
