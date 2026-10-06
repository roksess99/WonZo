// Database settings, shared by the shop (src/lib/db/index.ts) and the
// migration script (scripts/db-migrate.mjs). Plain JavaScript on purpose: the
// script runs with plain `node` during the build, and one implementation is
// better than two that drift apart.

const KEYS = ["DATABASE_HOST", "DATABASE_PORT", "DATABASE_NAME", "DATABASE_USER", "DATABASE_PASSWORD"];

/**
 * @typedef {{ host: string; port: number; database: string; user: string; password: string }} DbConfig
 */

/**
 * The database settings from the environment, checked when the code loads
 * (.claude/rules/beveiliging.md § Secrets). None set: null — the shop then
 * runs without a database, on the mock catalog (CLAUDE.md § Bouwvolgorde).
 * Some set: an error that names what is missing, never a half connection.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {DbConfig | null}
 */
export function parseDbConfig(env) {
  const value = (/** @type {string} */ k) => (env[k] ?? "").trim();
  if (KEYS.every((k) => !value(k))) return null;
  const missing = ["DATABASE_HOST", "DATABASE_NAME", "DATABASE_USER", "DATABASE_PASSWORD"].filter((k) => !value(k));
  if (missing.length) throw new Error(`Database settings incomplete: ${missing.join(", ")} not set (docs/DECISIONS.md D-06).`);
  const port = Number(value("DATABASE_PORT") || "3306");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`DATABASE_PORT is not a port number: ${JSON.stringify(value("DATABASE_PORT"))}.`);
  }
  // The password is not trimmed: a space can be part of it.
  return { host: value("DATABASE_HOST"), port, database: value("DATABASE_NAME"), user: value("DATABASE_USER"), password: env.DATABASE_PASSWORD ?? "" };
}

/**
 * Set on every connection. GEMETEN 2026-10-06 (D-06): the Hostinger server
 * runs without strict mode, so MariaDB would cut a too long text or clamp a
 * too large number with only a warning — for amounts that is silent data
 * loss. Strict mode turns those into errors. Time zone UTC: every timestamp
 * is stored in UTC and shown in the shop's time zone.
 */
export const SESSION_SETUP_SQL =
  "SET SESSION sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ZERO_DATE,NO_ZERO_IN_DATE,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY', time_zone = '+00:00'";

/**
 * Connection options for mysql2, from a DbConfig.
 * @param {DbConfig} config
 */
export function connectionOptions(config) {
  return {
    ...config,
    charset: "utf8mb4",
    connectTimeout: 10000,
    // BIGINT beyond 2^53 comes back as a string instead of a wrong number;
    // money code checks Number.isSafeInteger anyway (.claude/rules/geld.md).
    supportBigNumbers: true,
    bigNumberStrings: false,
    // DATETIME as a string in UTC, not a Date in the time zone of the Node process.
    dateStrings: true,
  };
}
