import { it, expect } from "vitest";
import {
  validateDeployment,
  selectPolicy,
} from "../../../src/features/guard/live/product-deployment";
import { deploymentFixture, scope } from "./operational-fixture";
it("binds the operational target and policy without an acceptance approval window", () => {
  const d = deploymentFixture(),
    v = validateDeployment(d);
  expect(v).toEqual(d);
  expect(v).not.toBe(d);
  expect(selectPolicy(v, scope.workspaceId, scope.projectId).maxAttempts).toBe(
    1,
  );
});
it.each([
  "g01_fixture",
  "sentinel",
  "root",
  "expiry",
  "engine_missing",
  "duplicate_policy",
  "scope",
])("refuses %s", (mode) => {
  const d = deploymentFixture();
  if (mode === "g01_fixture") d.target.database = "wetscan_s01_test_guardg01";
  if (mode === "sentinel") d.target.database = "wetscan_dev";
  if (mode === "root")
    d.privateRoot = d.privateRoot.replace("g02-runtime", "g01-runtime");
  if (mode === "expiry")
    d.deployments[0].qualification.expiresAt = new Date(0).toISOString();
  if (mode === "engine_missing") d.deployments = [];
  if (mode === "duplicate_policy") d.policies.push(d.policies[0]);
  if (mode === "scope") d.policies[0].projectId = "github-456";
  expect(() => validateDeployment(d)).toThrow();
});
it("another selected project cannot borrow the deployment policy", () =>
  expect(() =>
    selectPolicy(deploymentFixture(), scope.workspaceId, "github-456"),
  ).toThrow("not_found"));
