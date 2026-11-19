import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  referenceDocuments,
  validateExistingPasswords,
  g02Target,
} from "../../../scripts/guard-live-setup";
import { validateGuardApproval } from "../../../src/features/guard/live/database-config";
import { validateDeployment } from "../../../src/features/guard/live/product-deployment";
it("owner setup creates exact-target role configurations and leaves scan deployment deliberately unavailable", () => {
  const plan = "a".repeat(64),
    expires = new Date(Date.now() + 3 * 86400000).toISOString(),
    docs = referenceDocuments(plan, expires);
  expect(docs.target.target).toEqual(g02Target);
  expect(validateGuardApproval(docs.app, "app", plan).role).toBe(
    "wetscan_guard_app",
  );
  expect(validateGuardApproval(docs.worker, "worker", plan).role).toBe(
    "wetscan_guard_worker",
  );
  expect(() => validateDeployment(docs.target as never)).toThrow();
  expect(docs.target.policies).toEqual([]);
  expect(docs.target.deployments).toEqual([]);
  expect(docs.app.actions).toEqual(["runtime"]);
  expect(docs.app).not.toHaveProperty("password");
});
it.each([
  null,
  {},
  { app: "too_short", worker: "too_short" },
  { app: "SYNTHETIC\nREFERENCE", worker: "SYNTHETIC_REFERENCE_0000000000" },
])("invalid existing password input produces a fixed safe error", (input) => {
  expect(() => validateExistingPasswords(input)).toThrow(
    "EXISTING_PASSWORD_INPUT_INVALID",
  );
});
it("valid existing synthetic values are preserved rather than generated/reset/transformed", () => {
  const value = {
    app: "SYNTHETIC_REFERENCE_APP_00000000",
    worker: "SYNTHETIC_REFERENCE_WORKER_00000000",
  };
  expect(validateExistingPasswords(value)).toBe(value);
});
it("expired setup or excessive configuration lifetime is rejected offline", () => {
  expect(() =>
    referenceDocuments("a".repeat(64), new Date(Date.now() - 1).toISOString()),
  ).toThrow();
  expect(() =>
    referenceDocuments(
      "a".repeat(64),
      new Date(Date.now() + 31 * 86400000).toISOString(),
    ),
  ).toThrow();
});
