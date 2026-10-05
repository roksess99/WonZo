import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Import boundaries (docs/CI_CD.md, .claude/rules/catalogus.md): supplier
// shapes and the mock data never leave src/lib/catalog/.
const supplierBoundary = {
  patterns: [
    {
      group: ["@/lib/catalog/bigbuy/*", "@/lib/catalog/fixtures", "@/lib/catalog/fixtures/*", "**/catalog/bigbuy/*", "**/catalog/fixtures*"],
      message: "Supplier DTOs and fixtures stay inside src/lib/catalog/. Import the canonical types from @/lib/catalog/types.",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/catalog/**"],
    rules: { "no-restricted-imports": ["error", supplierBoundary] },
  },
  {
    // Components show; they never fetch from the supplier side directly.
    files: ["src/components/**/*.{ts,tsx}"],
    ignores: ["src/components/catalog/CategoryPage.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          ...supplierBoundary,
          paths: [{ name: "@/lib/catalog/provider", message: "Load data in a page or a server-only section, not in a component." }],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "tmp/**", "scripts/**"]),
]);

export default eslintConfig;
