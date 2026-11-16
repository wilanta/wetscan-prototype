import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  // Operator state and local env must be provisioned separately, never copied by file tracing.
  outputFileTracingExcludes: { "/*": ["./.env", "./.env.*", "./.local/**/*"] },
};
export default config;
