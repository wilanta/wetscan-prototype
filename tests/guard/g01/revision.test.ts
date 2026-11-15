import { expect, it } from "vitest";
import {
  guardRevision,
  validGuardBranch,
} from "../../../src/features/guard/live/revision";
it.each(["main", "feature/security", "release-v1", "dev_123"])(
  "accepts an explicit branch %s",
  (branch) => {
    expect(guardRevision({ branch, commit: "a".repeat(40) })).toEqual({
      branch,
      commit: "a".repeat(40),
    });
  },
);
it.each([
  "",
  "-option",
  "refs/heads/main",
  "../main",
  "feature//bad",
  "a@{b",
  "main.lock",
  "a/./b",
  "a/.hidden",
  "a..b",
  "bad name",
  "a\\b",
  "a?b",
  "a:b",
  "a[b",
  "a/b.",
])("rejects unsafe/ambiguous branch %s", (branch) => {
  expect(validGuardBranch(branch)).toBe(false);
  expect(() => guardRevision({ branch })).toThrow("invalid_input");
});
it("rejects client owner/installation fields, malformed SHAs and non-objects", () => {
  for (const value of [
    null,
    [],
    "main",
    { branch: "main", owner: "forged" },
    { branch: "main", commit: "bad" },
    { branch: "main", installationId: 999 },
  ])
    expect(() => guardRevision(value)).toThrow("invalid_input");
});
