import type { NextConfig } from "next";

/**
 * S11 baseline response hardening for every route. Deliberately NOT a script-restricting CSP: Next/React inline
 * bootstrap scripts need nonces, which is a separate reviewed change. These directives cannot break rendering.
 */
export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value:
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];
const config: NextConfig = {
  devIndicators: false,
  // Preserve isolated UI suites and G03's dedicated disposable browser-build output.
  distDir: process.env.G03_TEST_ISOLATED_BUILD === "1"
    ? ".local/g03-next-e2e"
    : process.env.UI_TEST_DIST_DIR || ".next",
  // `next build` type-checks the application graph only. Whole-repo type checking (tests, scripts, physical-scanner tooling)
  // stays in `npm run typecheck`/CI; the large tooling files do not belong in a deployment build.
  typescript: {
    tsconfigPath: process.env.G03_TEST_ISOLATED_BUILD === "1"
      ? ".local/g03-e2e.tsconfig.json"
      : "tsconfig.build.json",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
