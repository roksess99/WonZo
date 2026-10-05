import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` would otherwise append its agent-rules block to CLAUDE.md
  // (no AGENTS.md here), pushing it past the 200-line limit the template
  // validator enforces. The same advice — read the bundled docs in
  // node_modules/next/dist/docs/ first — lives in .claude/rules/frontend.md.
  agentRules: false,
};

export default nextConfig;
