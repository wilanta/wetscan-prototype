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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Operator state and local env must be provisioned separately, never copied by file tracing.
  outputFileTracingExcludes: { "/*": ["./.env", "./.env.*", "./.local/**/*"] },
  // Operator state and local env must be provisioned separately, never copied by file tracing.
  outputFileTracingExcludes: { "/*": ["./.env", "./.env.*", "./.local/**/*"] },
};
export default config;
