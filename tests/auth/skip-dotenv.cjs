// Preload only for validation commands: do not read local .env files.
// NODE_OPTIONS propagates this safeguard to Next build workers.
const envPath = require.resolve("@next/env");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- This Node CJS preload must replace the cached CommonJS export before Next loads.
const env = require(envPath);
require.cache[envPath].exports = {
  ...env,
  loadEnvConfig: () => ({
    combinedEnv: process.env,
    parsedEnv: {},
    loadedEnvFiles: [],
  }),
};
