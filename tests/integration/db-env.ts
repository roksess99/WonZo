// The integration tests run against a real MariaDB of the same kind as live
// (.claude/rules/database.md § Controles), and only against a database meant
// for tests: TEST_DATABASE_* in .env, mapped onto the DATABASE_* the shop
// reads. Never the dev or live database: a name without "test", or the same
// name as DATABASE_NAME, stops the run. Errors name the setting, never its value.

type Key = "HOST" | "PORT" | "NAME" | "USER" | "PASSWORD";

export function testDatabaseEnv(env: Record<string, string | undefined>): Record<string, string> {
  const get = (k: Key) => (env[`TEST_DATABASE_${k}`] ?? "").trim();
  const missing = (["HOST", "NAME", "USER", "PASSWORD"] as const).filter((k) => !get(k)).map((k) => `TEST_DATABASE_${k}`);
  if (missing.length) {
    throw new Error(`Integration tests need a test database: ${missing.join(", ")} not set in .env (run: pnpm test:db).`);
  }
  if (!/test/i.test(get("NAME"))) throw new Error('TEST_DATABASE_NAME must contain "test": the tests write orders and must never touch the dev or live database.');
  if (get("NAME") === (env.DATABASE_NAME ?? "").trim()) throw new Error("TEST_DATABASE_NAME is the same database as DATABASE_NAME: refused.");
  return {
    DATABASE_HOST: get("HOST"),
    DATABASE_PORT: get("PORT"),
    DATABASE_NAME: get("NAME"),
    DATABASE_USER: get("USER"),
    // Not trimmed: a space can be part of a password.
    DATABASE_PASSWORD: env.TEST_DATABASE_PASSWORD ?? "",
    // The tests order from the mock catalog, whatever .env says for the dev shop.
    CATALOG_SOURCE: "mock",
  };
}
