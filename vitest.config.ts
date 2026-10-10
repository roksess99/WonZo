import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    // Those need the test database: `pnpm test:db` (vitest.integration.config.ts).
    exclude: ["tests/integration/**", "**/node_modules/**"],
    environment: "node",
  },
});
