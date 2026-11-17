import path from "node:path";
import { defineConfig } from "vitest/config";

// Demo data for the DEV database (scripts/demo/seed.demo.ts): orders,
// invoices, returns, reviews, statistics and admins made by the shop's own
// code, with stand-ins for Mollie and BigBuy — nothing goes to a real
// provider and no mail goes out. Run by the owner: `pnpm demo:seed`.
// Only a database whose name contains "dev": never live, never the tests'.

function devDatabaseOnly(env: Record<string, string | undefined>): Record<string, string> {
  const name = (env.DATABASE_NAME ?? "").trim();
  if (!/dev/i.test(name)) throw new Error('DATABASE_NAME must contain "dev": demo data goes into the dev database only.');
  if (/test/i.test(name) || name === (env.TEST_DATABASE_NAME ?? "").trim()) throw new Error("That is the test database: refused.");
  if (env.NODE_ENV === "production") throw new Error("NODE_ENV=production: refused.");
  return {};
}

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["scripts/demo/seed.demo.ts"],
    environment: "node",
    env: devDatabaseOnly(process.env),
    // A remote database and a few hundred steps.
    testTimeout: 30 * 60_000,
    hookTimeout: 5 * 60_000,
  },
});
