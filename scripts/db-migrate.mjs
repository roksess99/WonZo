#!/usr/bin/env node
// Brings the database schema up to date with db/migrations/ (D-06: runs
// automatically on every deploy, before the build — `pnpm build` starts with
// it). Rules: .claude/rules/database.md § Migraties.
//
//   pnpm db:migrate     apply what is new
//   pnpm db:status      show what is applied and what is pending; changes nothing
//
// - No DATABASE_* set: nothing to do, exit 0 — the shop then runs on the mock,
//   and a build without a database (CI, a fresh checkout) must still work.
// - One run at a time: GET_LOCK, so two deploys cannot migrate together.
// - A migration that already ran is never changed: its checksum is stored, and
//   a changed file stops the run.
// - Every file states its rollback plan ("-- rollback:"); without one it is refused.
// - DDL in MariaDB cannot be rolled back, so a migration must be safe to run
//   again (IF NOT EXISTS) — a failure halfway leaves no row in
//   schema_migrations, and the next run starts it again.
//
// Output: what happened, without password or host.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { connectionOptions, parseDbConfig, SESSION_SETUP_SQL } from '../src/lib/db/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'db', 'migrations');
const STATUS_ONLY = process.argv.includes('--status');
const NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;

const say = (s) => console.log(`[db-migrate] ${s}`);

let config;
try {
  config = parseDbConfig(process.env);
} catch (err) {
  say(err.message);
  process.exit(1);
}
if (!config) {
  say('No database configured (DATABASE_* not set): nothing to migrate.');
  process.exit(0);
}
const clean = (text) => String(text).split(config.host).join('<host>');

// ---------------------------------------------------------------- the files

const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort() : [];
const migrations = [];
for (const file of files) {
  const m = NAME.exec(file);
  if (!m) {
    say(`Refused: ${file} — name must be NNNN_lowercase_words.sql`);
    process.exit(1);
  }
  const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
  if (!/^--\s*rollback:\s*\S/im.test(sql)) {
    say(`Refused: ${file} has no "-- rollback:" line (.claude/rules/database.md: every migration has a rollback plan)`);
    process.exit(1);
  }
  migrations.push({ id: file.replace(/\.sql$/, ''), sql, checksum: createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex') });
}
const numbers = migrations.map((m) => m.id.slice(0, 4));
const duplicate = numbers.find((n, i) => numbers.indexOf(n) !== i);
if (duplicate) {
  say(`Refused: two migrations with number ${duplicate}`);
  process.exit(1);
}

// ---------------------------------------------------------------- the database

let conn;
try {
  conn = await mysql.createConnection({ ...connectionOptions(config), multipleStatements: true });
} catch (err) {
  say(`Cannot connect to database "${config.database}": ${clean(`${err.code ?? ''} ${err.message ?? err}`)}`);
  process.exit(1);
}

let exitCode = 0;
let locked = false;
try {
  await conn.query(SESSION_SETUP_SQL);
  const [[lock]] = await conn.query("SELECT GET_LOCK('wonzo_migrate', 60) AS got");
  if (Number(lock.got) !== 1) throw new Error('another migration run holds the lock (waited 60 s)');
  locked = true;

  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    duration_ms INT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const [appliedRows] = await conn.query('SELECT id, checksum FROM schema_migrations ORDER BY id');
  const applied = new Map(appliedRows.map((r) => [r.id, r.checksum]));

  for (const [id, checksum] of applied) {
    const file = migrations.find((m) => m.id === id);
    if (!file) throw new Error(`${id} was applied but its file is gone from db/migrations/ — never remove a migration that ran`);
    if (file.checksum !== checksum) throw new Error(`${id} was changed after it ran — write a new migration instead`);
  }

  const pending = migrations.filter((m) => !applied.has(m.id));
  say(`Database "${config.database}": ${applied.size} applied, ${pending.length} pending${pending.length ? `: ${pending.map((m) => m.id).join(', ')}` : ''}.`);

  if (!STATUS_ONLY) {
    for (const m of pending) {
      const t0 = Date.now();
      await conn.query(m.sql);
      await conn.execute('INSERT INTO schema_migrations (id, checksum, duration_ms) VALUES (?, ?, ?)', [m.id, m.checksum, Date.now() - t0]);
      say(`Applied ${m.id} in ${Date.now() - t0} ms.`);
    }
    if (pending.length) say('Up to date.');
  }
} catch (err) {
  say(`Failed: ${clean(`${err.code ?? ''} ${err.message ?? err}`.trim())}`);
  exitCode = 1;
} finally {
  if (locked) await conn.query("SELECT RELEASE_LOCK('wonzo_migrate')").catch(() => {});
  await conn.end().catch(() => {});
}
process.exit(exitCode);
