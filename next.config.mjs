// JavaScript, not TypeScript: on Hostinger's build servers Next.js 16.3 cannot
// load its native compiler (it needs glibc 2.29, the servers have less —
// GEMETEN 2026-10-06, vercel/next.js#96960) and falls back to WebAssembly,
// which cannot compile next.config.ts. A plain ES module needs no compiling.

/** @type {import("next").NextConfig} */
const nextConfig = {
  // `next dev` would otherwise append its agent-rules block to CLAUDE.md
  // (no AGENTS.md here), pushing it past the 200-line limit the template
  // validator enforces. The same advice — read the bundled docs in
  // node_modules/next/dist/docs/ first — lives in .claude/rules/frontend.md.
  agentRules: false,
  // Loaded by Node at run time instead of bundled by webpack: mysql2 loads
  // parts of itself dynamically (character sets), which a bundle can break.
  serverExternalPackages: ["mysql2"],
};

export default nextConfig;
