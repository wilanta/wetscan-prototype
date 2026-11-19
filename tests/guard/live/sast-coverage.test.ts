import { it, expect } from "vitest";
import { operationalSastCoverage } from "../../../worker/guard/scanner-adapter";
import type { AuthorizedSnapshot } from "../../../src/features/guard/contracts";
const snapshot = {
  files: [{ path: "test.js" }, { path: "other.js" }],
} as AuthorizedSnapshot;
it("uses actual manifest-bound scanned paths", () => {
  expect(
    operationalSastCoverage(
      { paths: { scanned: ["/source/test.js"] }, results: [] },
      snapshot,
    ),
  ).toMatchObject({ status: "completed" });
});
it("zero scanned files never claims a clean completed scan", () => {
  expect(
    operationalSastCoverage({ paths: { scanned: [] }, results: [] }, snapshot),
  ).toMatchObject({ status: "not_applicable" });
});
it.each([
  {},
  { paths: {} },
  { paths: { scanned: "test.js" } },
  { paths: { scanned: ["/source/unknown.js"] } },
  { paths: { scanned: ["/source/../test.js"] } },
  { paths: { scanned: ["test.js", "/source/test.js"] } },
  { paths: { scanned: [] }, results: [{ path: "test.js" }] },
  { paths: { scanned: ["test.js"] }, results: [{ path: "other.js" }] },
])("invalid coverage fails closed: %j", (data) => {
  expect(() => operationalSastCoverage(data, snapshot)).toThrow();
});
it("result paths belong to the actually scanned set", () => {
  expect(
    operationalSastCoverage(
      {
        paths: { scanned: ["/source/test.js"] },
        results: [{ path: "test.js" }],
      },
      snapshot,
    ),
  ).toMatchObject({ status: "completed" });
});

it("partial file processing or parser errors are explicit, never complete coverage", () => {
  expect(
    operationalSastCoverage(
      { paths: { scanned: ["test.js"] }, results: [] },
      snapshot,
    ).coverage,
  ).toMatchObject({ status: "partial", scannedFiles: 1, eligibleFiles: 2 });
  expect(
    operationalSastCoverage(
      {
        paths: { scanned: ["test.js", "other.js"] },
        results: [],
        errors: [{ type: "ParseError" }],
      },
      snapshot,
    ).coverage.status,
  ).toBe("partial");
});
