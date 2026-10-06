#!/usr/bin/env node
// Drives the catalog refresh locally, the way the scheduled task does on
// Hostinger: it calls POST /api/cron/catalog of a running shop, again and
// again, and prints what each slice did. Run by the owner (the secret lives
// in .env, which Claude may not read), with the shop running (`pnpm dev`):
//
//   node --env-file=.env scripts/catalog-sync.mjs                 until the run is finished
//   node --env-file=.env scripts/catalog-sync.mjs --once          one slice
//   node --env-file=.env scripts/catalog-sync.mjs --url http://localhost:3000
//
// A full run takes about 3 hours because of the supplier's limits (D-31); the
// script waits between slices and can be stopped and started again at any
// time — the progress is in the database.

const argv = process.argv.slice(2);
const url = (argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : 'http://localhost:3000').replace(/\/+$/, '');
const once = argv.includes('--once');
const secret = (process.env.JOB_TOKEN ?? '').trim();
if (secret.length < 32) {
  console.error('JOB_TOKEN is missing or shorter than 32 characters (run with --env-file=.env).');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString('nl-NL');

for (;;) {
  let res;
  try {
    res = await fetch(`${url}/api/cron/catalog`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(180_000) });
  } catch (err) {
    console.log(`${stamp()} geen antwoord van ${url} (${err.name}). Draait de winkel (pnpm dev)?`);
    process.exit(1);
  }
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200) {
    console.log(`${stamp()} HTTP ${res.status} ${JSON.stringify(body)}`);
    process.exit(1);
  }
  if (body.status === 'not-configured') {
    console.log(`${stamp()} niet ingesteld: ${body.missing.join(', ')} ontbreekt in .env`);
    process.exit(1);
  }
  if (body.status === 'idle') {
    console.log(`${stamp()} niets te doen: de catalogus is bij.`);
    break;
  }
  if (body.status === 'busy') console.log(`${stamp()} er loopt al een stukje; even wachten.`);
  if (body.status === 'worked') {
    for (const d of body.did) console.log(`${stamp()} ronde ${body.runId} (${body.kind}): ${d}`);
    if (body.error) console.log(`${stamp()} fout bij de leverancier: ${body.error} — volgende keer opnieuw`);
    if (body.finished) {
      console.log(`${stamp()} ronde ${body.runId} klaar.`);
      break;
    }
    if (body.waiting.length) console.log(`${stamp()} wacht op de limiet van: ${body.waiting.join(', ')}`);
  }
  if (once) break;
  // Like the scheduled task: a slice every minute.
  await sleep(60_000);
}
