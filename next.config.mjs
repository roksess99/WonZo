// JavaScript, not TypeScript: on Hostinger's build servers Next.js 16.3 cannot
// load its native compiler (it needs glibc 2.29, the servers have less —
// GEMETEN 2026-10-06, vercel/next.js#96960) and falls back to WebAssembly,
// which cannot compile next.config.ts. A plain ES module needs no compiling.

/**
 * Security headers for every response (.claude/rules/beveiliging.md § Headers
 * en CSP). A full Content-Security-Policy for scripts is its own task —
 * Report-Only first, measured, with an E2E test on the checkout — so the only
 * CSP directive here is frame-ancestors. Hostinger's CDN adds its own CSP
 * header (upgrade-insecure-requests); a browser applies both.
 */
const securityHeaders = [
  // No includeSubDomains yet: whether every subdomain (mail, webmail) speaks
  // HTTPS is not measured, and HSTS cannot be taken back for a year.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import("next").NextConfig} */
const nextConfig = {
  // `next dev` would otherwise append its agent-rules block to CLAUDE.md
  // (no AGENTS.md here), pushing it past the 200-line limit the template
  // validator enforces. The same advice — read the bundled docs in
  // node_modules/next/dist/docs/ first — lives in .claude/rules/frontend.md.
  agentRules: false,
  // Says nothing a visitor needs, and tells an attacker which framework to try.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
