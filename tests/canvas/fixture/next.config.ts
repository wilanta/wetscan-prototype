import { resolve } from "node:path";
import type { NextConfig } from "next";
// Isolated test-only host. No proxy, auth APIs, tokens, repository readers or production wiring.
const config: NextConfig = {
  devIndicators: false,
  agentRules: false,
  turbopack: { root: resolve(process.cwd()) },
};
export default config;
