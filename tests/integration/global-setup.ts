// Before the integration tests: bring the test database up to date with the
// same migration script the deploy uses — so "migrations from empty to now"
// is tested every run (docs/TESTEN.md § Integration).

import { spawnSync } from "node:child_process";
import { testDatabaseEnv } from "./db-env";

export default function setup(): void {
  const r = spawnSync(process.execPath, ["scripts/db-migrate.mjs"], {
    env: { ...process.env, ...testDatabaseEnv(process.env) },
    stdio: "inherit",
  });
  if (r.status !== 0) throw new Error("Migrating the test database failed (see above).");
}
