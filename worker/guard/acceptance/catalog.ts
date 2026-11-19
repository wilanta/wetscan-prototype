export const caseLimits = {
  Q00: [0, 0, 0, 6, 0, 55],
  I01: [1, 1, 1, 1, 0, 55],
  N00: [0, 0, 0, 0, 0, 20],
  N01: [1, 1, 1, 0, 1, 30],
  N02: [1, 1, 1, 1, 1, 20],
  N03: [1, 1, 1, 1, 1, 25],
  N04: [1, 1, 0, 0, 1, 20],
  N05: [1, 1, 1, 1, 1, 20],
  N06: [1, 1, 1, 0, 1, 20],
  N07: [1, 1, 1, 1, 1, 25],
  N08: [1, 1, 1, 0, 1, 25],
  C01: [1, 2, 2, 2, 0, 40],
  C02A: [1, 3, 2, 2, 0, 55],
  C02B: [0, 0, 0, 0, 0, 20],
  L01: [0, 0, 0, 0, 0, 20],
  L02: [0, 0, 0, 0, 0, 10],
} as const;
export type CaseId = keyof typeof caseLimits;
export const spentJob =
  "2c18db662dcf8fec6052e05d02ed1362802facd839fca81a71a888c37b09ee18";
export const fixtureTarget = Object.freeze({
  host: "localhost",
  port: 5432,
  database: "wetscan_s01_test_guardg01",
  marker: "wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f",
});
export const acceptanceTiming = Object.freeze({
  sourceMs: 45000,
  acquireRpcMs: 55000,
  probeRpcMs: 60000,
  handlerMs: 120000,
  requestMs: 180000,
  grantMs: 60000,
  leaseMs: 30000,
  heartbeatMs: 5000,
  orphanAgeMs: 3600000,
  permitExpiryMs: 55000, // Must precede the original snapshot/grant's 60s expiry.
});
