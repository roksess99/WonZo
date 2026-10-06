#!/usr/bin/env node
// Measures what the database can do, before anything is built on it (D-06,
// docs/HOSTING.md § 5 and § 9: "test an unknown database feature on a
// throwaway table first").
//
// Run by the owner (the password lives in .env, which Claude may not read):
//
//   node --env-file=.env scripts/db-check.mjs
//
// It connects with DATABASE_HOST/PORT/NAME/USER/PASSWORD, reports the server
// and its settings, and tries every feature the shop relies on in one
// throwaway table (zz_wonzo_check), which it drops at the end. Nothing else
// is touched. It refuses a database whose name does not contain "dev" unless
// --allow-production is given: measure on wonzo_dev, not on the live data.
//
// Output: a summary on stdout without the password or the host.

import mysql from 'mysql2/promise';

const env = (k) => (process.env[k] ?? '').trim();
const config = {
  host: env('DATABASE_HOST'),
  port: Number(env('DATABASE_PORT') || '3306'),
  database: env('DATABASE_NAME'),
  user: env('DATABASE_USER'),
  password: process.env.DATABASE_PASSWORD ?? '',
};

const missing = ['DATABASE_HOST', 'DATABASE_NAME', 'DATABASE_USER', 'DATABASE_PASSWORD'].filter((k) => !env(k));
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(', ')} (run with --env-file=.env)`);
  process.exit(1);
}
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  console.error(`DATABASE_PORT is not a port number: ${JSON.stringify(env('DATABASE_PORT'))}`);
  process.exit(1);
}
if (!/dev/i.test(config.database) && !process.argv.includes('--allow-production')) {
  console.error(`DATABASE_NAME "${config.database}" does not look like a development database. Measure on wonzo_dev, or add --allow-production.`);
  process.exit(1);
}

// Error messages of the driver can contain the host; the summary promises it does not.
const clean = (text) => String(text).split(config.host).join('<host>');

const TABLE = 'zz_wonzo_check';
const out = [];
const line = (s = '') => out.push(s);
const results = [];
const check = async (label, fn) => {
  try {
    const detail = await fn();
    results.push([label, 'JA', detail ?? '']);
  } catch (err) {
    results.push([label, 'NEE', clean(`${err.code ?? ''} ${err.message ?? err}`.trim()).slice(0, 160)]);
  }
};

line(`Databasemeting — ${new Date().toISOString().slice(0, 10)} — database "${config.database}"`);
line('Plak dit blok in het gesprek. Het bevat geen wachtwoord en geen host.');
line('');

let a;
let b;
const started = Date.now();
try {
  a = await mysql.createConnection({ ...config, connectTimeout: 10000, charset: 'utf8mb4' });
} catch (err) {
  line(`VERBINDING MISLUKT: ${clean(`${err.code ?? ''} ${err.message ?? err}`)}`);
  line('Veelvoorkomend: ER_ACCESS_DENIED_ERROR = gebruiker/wachtwoord of je IP staat niet bij Remote MySQL;');
  line('ETIMEDOUT / ECONNREFUSED = verkeerde host of poort, of Remote MySQL staat niet aan voor je IP.');
  console.log(out.join('\n'));
  process.exit(1);
}
line(`Verbinding: gelukt in ${Date.now() - started} ms`);

// One variable at a time: MySQL and MariaDB name some of them differently
// (transaction_isolation vs tx_isolation), and one unknown name must not stop the measurement.
const variable = async (...names) => {
  for (const n of names) {
    try {
      const [[r]] = await a.query(`SELECT @@${n} AS v`);
      return r.v;
    } catch {
      /* try the next name */
    }
  }
  return '?';
};
const [[{ version }]] = await a.query('SELECT VERSION() AS version');
const server = {
  version,
  comment: await variable('version_comment'),
  sqlMode: await variable('sql_mode'),
  tz: await variable('time_zone'),
  systemTz: await variable('system_time_zone'),
  charset: await variable('character_set_server'),
  collation: await variable('collation_server'),
  engine: await variable('default_storage_engine'),
  isolation: await variable('transaction_isolation', 'tx_isolation'),
  maxPacket: Number(await variable('max_allowed_packet')),
  lockWait: await variable('innodb_lock_wait_timeout'),
  maxConnections: await variable('max_connections'),
  waitTimeout: await variable('wait_timeout'),
};
line(`Server: ${server.version} (${server.comment})`);
line(`Standaard: engine ${server.engine}, tekenset ${server.charset} / ${server.collation}, isolatie ${server.isolation}`);
line(`Tijdzone: ${server.tz} (systeem ${server.systemTz})`);
line(`sql_mode: ${server.sqlMode || '(leeg)'}`);
line(`Grenzen: max_allowed_packet ${Math.round(server.maxPacket / 1024 / 1024)} MB, lock wait ${server.lockWait} s, max_connections ${server.maxConnections}, wait_timeout ${server.waitTimeout} s`);
const [[grants]] = await a.query('SELECT CURRENT_USER() AS who');
const [grantRows] = await a.query('SHOW GRANTS');
line(`Rechten van ${String(grants.who).replace(/@.*/, '@…')}: ${grantRows.map((r) => Object.values(r)[0]).map((g) => g.replace(/`[^`]*`@`[^`]*`/, '…').replace(/IDENTIFIED BY .*/, '')).join(' | ').slice(0, 400)}`);
line('');

await a.query(`DROP TABLE IF EXISTS ${TABLE}`);

await check('Tabel maken met InnoDB en utf8mb4', async () => {
  await a.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL,
    amount_cents BIGINT NOT NULL,
    note VARCHAR(100) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_code (code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [[t]] = await a.query(`SELECT ENGINE AS engine, TABLE_COLLATION AS coll FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [TABLE]);
  return `${t.engine}, ${t.coll}`;
});

await check('IF NOT EXISTS bij een tweede keer (migraties)', async () => {
  await a.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (id INT PRIMARY KEY)`);
});

await check('Emoji en accenten heel terug (utf8mb4)', async () => {
  const text = 'Crème brûlée 🍮 Ø 21 cm';
  await a.execute(`INSERT INTO ${TABLE} (code, amount_cents, note) VALUES (?, ?, ?)`, ['utf8', 1, text]);
  const [[r]] = await a.execute(`SELECT note FROM ${TABLE} WHERE code = ?`, ['utf8']);
  if (r.note !== text) throw new Error(`kwam terug als ${JSON.stringify(r.note)}`);
});

await check('Grote bedragen in centen exact (BIGINT)', async () => {
  const big = 900719925474099; // ruim boven elke bestelling, onder Number.MAX_SAFE_INTEGER
  await a.execute(`INSERT INTO ${TABLE} (code, amount_cents) VALUES (?, ?)`, ['big', big]);
  const [[r]] = await a.execute(`SELECT amount_cents FROM ${TABLE} WHERE code = ?`, ['big']);
  if (Number(r.amount_cents) !== big) throw new Error(`kwam terug als ${r.amount_cents}`);
  return `teruggegeven als ${typeof r.amount_cents}`;
});

await check('Unieke sleutel weigert een dubbele (idempotentie)', async () => {
  try {
    await a.execute(`INSERT INTO ${TABLE} (code, amount_cents) VALUES (?, ?)`, ['big', 2]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return 'ER_DUP_ENTRY';
    throw err;
  }
  throw new Error('dubbele werd geaccepteerd');
});

await check('Transactie: terugdraaien laat niets achter', async () => {
  await a.beginTransaction();
  await a.execute(`INSERT INTO ${TABLE} (code, amount_cents) VALUES (?, ?)`, ['rollback', 1]);
  await a.rollback();
  const [[r]] = await a.execute(`SELECT COUNT(*) AS n FROM ${TABLE} WHERE code = ?`, ['rollback']);
  if (Number(r.n) !== 0) throw new Error('rij bleef staan na rollback');
});

await check('Rij vergrendelen met SELECT … FOR UPDATE (tweede verbinding wacht)', async () => {
  b = await mysql.createConnection({ ...config, connectTimeout: 10000, charset: 'utf8mb4' });
  await b.query('SET SESSION innodb_lock_wait_timeout = 2');
  await a.beginTransaction();
  await a.execute(`SELECT id FROM ${TABLE} WHERE code = ? FOR UPDATE`, ['big']);
  const t0 = Date.now();
  try {
    await b.beginTransaction();
    await b.execute(`UPDATE ${TABLE} SET note = 'b' WHERE code = ?`, ['big']);
    await b.rollback();
    throw new Error('tweede verbinding kon toch schrijven');
  } catch (err) {
    await b.rollback().catch(() => {});
    if (err.code !== 'ER_LOCK_WAIT_TIMEOUT') throw err;
  } finally {
    await a.rollback();
  }
  return `tweede verbinding wachtte ${((Date.now() - t0) / 1000).toFixed(1)} s en kreeg ER_LOCK_WAIT_TIMEOUT`;
});

await check('Gegenereerde kolom (STORED)', async () => {
  await a.query(`ALTER TABLE ${TABLE} ADD COLUMN amount_euros DECIMAL(20,2) AS (amount_cents / 100) STORED`);
});

await check('Gegenereerde kolom (VIRTUAL)', async () => {
  await a.query(`ALTER TABLE ${TABLE} ADD COLUMN code_upper VARCHAR(40) AS (UPPER(code)) VIRTUAL`);
});

await check('JSON-kolom', async () => {
  await a.query(`ALTER TABLE ${TABLE} ADD COLUMN data JSON NULL`);
  await a.execute(`UPDATE ${TABLE} SET data = ? WHERE code = ?`, [JSON.stringify({ a: 1 }), 'big']);
  const [[r]] = await a.execute(`SELECT JSON_EXTRACT(data, '$.a') AS a FROM ${TABLE} WHERE code = ?`, ['big']);
  return `JSON_EXTRACT gaf ${r.a}`;
});

await check('INSERT … ON DUPLICATE KEY UPDATE (upsert voor de catalogus)', async () => {
  await a.execute(`INSERT INTO ${TABLE} (code, amount_cents) VALUES (?, ?) ON DUPLICATE KEY UPDATE amount_cents = VALUES(amount_cents)`, ['big', 5]);
  const [[r]] = await a.execute(`SELECT amount_cents FROM ${TABLE} WHERE code = ?`, ['big']);
  if (Number(r.amount_cents) !== 5) throw new Error(`bedrag is ${r.amount_cents}`);
});

await check('Advisory lock GET_LOCK (één migratie tegelijk)', async () => {
  const [[r]] = await a.query(`SELECT GET_LOCK('wonzo_check', 1) AS got`);
  await a.query(`SELECT RELEASE_LOCK('wonzo_check')`);
  if (Number(r.got) !== 1) throw new Error(`GET_LOCK gaf ${r.got}`);
});

await check('Opruimen (DROP TABLE)', async () => {
  await a.query(`DROP TABLE ${TABLE}`);
});

await b?.end().catch(() => {});
await a.end().catch(() => {});

line('Mogelijkheden:');
for (const [label, ok, detail] of results) line(`   ${ok === 'JA' ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
console.log(out.join('\n'));
