// The connection to the database (D-06: MariaDB at Hostinger). Server-side
// only. Queries are parameterised, always (.claude/rules/beveiliging.md
// § Injection).

import mysql from "mysql2/promise";
import { connectionOptions, parseDbConfig, SESSION_SETUP_SQL } from "./config.mjs";

if (typeof window !== "undefined") {
  throw new Error("The database layer must not run in the browser");
}

export type { DbConfig } from "./config.mjs";
export type Connection = mysql.PoolConnection;
/** Anything that runs a query: the pool, or one connection from it. */
export type Queryable = Pick<mysql.Pool, "query">;

/** Rows of a SELECT, typed by the caller (the shape is checked where the rows are used). */
export async function selectRows<T>(db: Queryable, sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await db.query(sql, params);
  return rows as T[];
}

/** A Date as a DATETIME(3) value in UTC (the session time zone, SESSION_SETUP_SQL). */
export function toDbTime(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "");
}

/** A DATETIME(3) value (a string, `dateStrings`) back to a Date; it is UTC. */
export function fromDbTime(s: string): Date {
  return new Date(`${s.replace(" ", "T")}Z`);
}

/** MariaDB's error for a duplicate unique key. */
export function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: unknown }).code === "ER_DUP_ENTRY";
}

const config = parseDbConfig(process.env);

/** Whether this shop has a database; without one it runs on the mock (CLAUDE.md § Bouwvolgorde). */
export const hasDatabase = config !== null;

let pool: mysql.Pool | null = null;

/** The shared pool, created on first use. */
export function getPool(): mysql.Pool {
  if (!config) throw new Error("No database configured (DATABASE_* not set)");
  if (!pool) {
    pool = mysql.createPool({
      ...connectionOptions(config),
      // Shared hosting: few connections, and they are cheap to open (127 ms).
      connectionLimit: 5,
      // GEMETEN 2026-10-06: the server closes an idle connection after 20 s
      // (wait_timeout). Close it here first, or the next query after a quiet
      // spell gets a dead connection.
      idleTimeout: 10_000,
      maxIdle: 2,
      enableKeepAlive: true,
    });
    // Every new connection gets strict mode and UTC before its first query
    // (queries on one connection run in order).
    pool.pool.on("connection", (conn) => {
      conn.query(SESSION_SETUP_SQL);
    });
  }
  return pool;
}

/**
 * Runs `fn` in one transaction: commit when it returns, rollback when it
 * throws. Never call a supplier, payment provider or mail inside `fn`
 * (.claude/rules/database.md § Transacties).
 */
export async function withTransaction<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

export type DatabaseStatus =
  | { state: "not-configured" }
  | { state: "ok"; lastMigration: string | null }
  | { state: "unreachable" };

/** For the health check: can we reach the database, and which migration is the last one applied? */
export async function databaseStatus(): Promise<DatabaseStatus> {
  if (!config) return { state: "not-configured" };
  try {
    const [rows] = await getPool().query<mysql.RowDataPacket[]>(
      "SELECT id FROM schema_migrations ORDER BY id DESC LIMIT 1",
    );
    return { state: "ok", lastMigration: (rows[0]?.id as string | undefined) ?? null };
  } catch (err) {
    // No migration table yet still means the database answers.
    if ((err as { code?: string }).code === "ER_NO_SUCH_TABLE") return { state: "ok", lastMigration: null };
    return { state: "unreachable" };
  }
}
