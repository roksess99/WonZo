import path from "node:path";
import { defineConfig } from "vitest/config";
import { testDatabaseEnv } from "./tests/integration/db-env";

// Integration tests against the test database (tests/integration/db-env.ts).
// Run by the owner, with the settings from .env: `pnpm test:db`.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    env: testDatabaseEnv(process.env),
    globalSetup: ["tests/integration/global-setup.ts"],
    // One file at a time: the files share one database.
    fileParallelism: false,
    // A remote database: a query takes ~100 ms, a lock wait longer.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
