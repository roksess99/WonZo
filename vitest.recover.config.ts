import path from "node:path";
import { defineConfig } from "vitest/config";

// Access to the panel lost, with no other owner to reset it (D-07, user
// 2026-11-24): scripts/admin/recover.run.ts clears the owner's password, app
// and recovery codes and prints a new invitation link in this terminal only.
// Run by the owner, never by Claude: `pnpm admin:herstel`, from the same .env
// as the rest. The live database comes from LIVE_DATABASE_*, mapped onto the
// DATABASE_* the shop reads, so DATABASE_* keeps pointing at the dev database
// for `pnpm dev`. Errors name the setting, never its value.

type Key = "HOST" | "PORT" | "NAME" | "USER" | "PASSWORD";

function recoverEnv(env: Record<string, string | undefined>): Record<string, string> {
  const get = (k: Key) => (env[`LIVE_DATABASE_${k}`] ?? "").trim();
  const missing = [...(["HOST", "NAME", "USER", "PASSWORD"] as const).filter((k) => !get(k)).map((k) => `LIVE_DATABASE_${k}`), ...((env.ADMIN_RECOVER_EMAIL ?? "").trim() ? [] : ["ADMIN_RECOVER_EMAIL"])];
  if (missing.length) throw new Error(`Recovery needs ${missing.join(", ")} in .env (run: pnpm admin:herstel).`);
  if (/test/i.test(get("NAME"))) throw new Error("LIVE_DATABASE_NAME is a test database: the panel's owner is not there.");
  return {
    DATABASE_HOST: get("HOST"),
    DATABASE_PORT: get("PORT"),
    DATABASE_NAME: get("NAME"),
    DATABASE_USER: get("USER"),
    // Not trimmed: a space can be part of a password.
    DATABASE_PASSWORD: env.LIVE_DATABASE_PASSWORD ?? "",
    // The link points at the live shop, whatever .env says for the dev shop.
    NEXT_PUBLIC_SITE_URL: "https://wonzo.nl",
  };
}

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["scripts/admin/recover.run.ts"],
    environment: "node",
    env: recoverEnv(process.env),
    testTimeout: 60_000,
  },
});
