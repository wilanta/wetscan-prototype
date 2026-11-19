import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  // Keep tracing within this existing worktree. Production uses the supported
  // Webpack mode: Turbopack's earlier dynamic-fs analysis ignores NFT exclusions.
  outputFileTracingRoot: process.cwd(),
  // Operator state and local env must be provisioned separately, never copied by file tracing.
  outputFileTracingExcludes: {
    "/*": ["./.env", "./.env.*", "./.local", "./.local/**/*"],
    "next-server": ["./.env", "./.env.*", "./.local", "./.local/**/*"],
  },
};
export default config;
