import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ target: vi.fn(), deployment: vi.fn(), plan: vi.fn(), pool: vi.fn(), config: vi.fn() }));
vi.mock("../../../src/features/guard/live/product-deployment", () => ({
 loadProductTarget: mocks.target, loadDeployment: mocks.deployment, selectPolicy: vi.fn(),
}));
vi.mock("../../../src/features/guard/live/migrations", () => ({ guardMigrationPlan: mocks.plan }));
vi.mock("../../../src/platform/database", () => ({ ApprovedPool: mocks.pool }));
vi.mock("../../../src/features/guard/live/database-config", () => ({ guardDatabaseConfig: mocks.config, guardRoles: { app:"wetscan_guard_app", worker:"wetscan_guard_worker", migration:"wetscan_guard_migrator" } }));
import { probeProductReadiness } from "../../../src/features/guard/live/product-preflight";
const env = { NODE_ENV: "test" as const, GUARD_PRODUCT_CONFIG_FILE: "non-secret-test-reference" };
beforeEach(() => {
 vi.resetAllMocks();
 mocks.target.mockResolvedValue({ database: "wetscan_dev_guardg02" });
 mocks.deployment.mockRejectedValue(Error("unqualified"));
 mocks.plan.mockResolvedValue({});
});
it.each([["EACCES","FILE_ACCESS_DENIED"],["EPERM","FILE_ACCESS_DENIED"],["ENOENT","FILE_NOT_FOUND"],["EIO","FILE_IO_ERROR"]])
("reports safe target-reference failure %s without pool construction or paths", async (code, reason) => {
 mocks.target.mockRejectedValue(Object.assign(Error("PRIVATE_PATH_AND_VALUE"),{code,path:"PRIVATE_PATH_AND_VALUE"}));
 const result = await probeProductReadiness(env);
 expect(result.configuration).toBe("INVALID_TARGET_CONFIGURATION");
 expect(result.configurationDiagnostic).toEqual({phase:"TARGET_CONFIGURATION",reason});
 expect(result.appDatabase).toBe("NOT_CONNECTED");
 expect(mocks.pool).not.toHaveBeenCalled();
 expect(mocks.plan).not.toHaveBeenCalled();
 expect(JSON.stringify(result)).not.toContain("PRIVATE_PATH_AND_VALUE");
});
it("invalid JSON is distinct from filesystem failure", async () => {
 mocks.target.mockRejectedValue(new SyntaxError("PRIVATE_CONTENT"));
 const result=await probeProductReadiness(env);
 expect(result.configurationDiagnostic).toEqual({phase:"TARGET_CONFIGURATION",reason:"INVALID_JSON"});
 expect(JSON.stringify(result)).not.toContain("PRIVATE_CONTENT");
});
it("schema-plan failure does not relabel an already verified target as invalid", async () => {
 mocks.plan.mockRejectedValue(Object.assign(Error("PRIVATE_SCHEMA_PATH"),{code:"ENOENT"}));
 const result=await probeProductReadiness(env);
 expect(result.configuration).toBe("TARGET_VERIFIED");
 expect(result.configurationDiagnostic).toEqual({phase:"SCHEMA_PLAN",reason:"FILE_NOT_FOUND"});
 expect(result.appDatabase).toBe("NOT_CONNECTED");
 expect(mocks.pool).not.toHaveBeenCalled();
 expect(JSON.stringify(result)).not.toContain("PRIVATE_SCHEMA_PATH");
});
it("unknown errors never leak arbitrary error fields or imply readiness", async () => {
 mocks.target.mockRejectedValue({ message:"SECRET", code:"UNSAFE_SECRET", token:"SECRET" });
 const result=await probeProductReadiness(env);
 expect(result.configurationDiagnostic).toEqual({phase:"TARGET_CONFIGURATION",reason:"UNKNOWN"});
 expect(result.runtimeOperations).toBe(0);
 expect(JSON.stringify(result)).not.toContain("SECRET");
});

it("database close unknown cannot leave both role readiness fields verified", async () => {
 mocks.config.mockResolvedValue({});
 mocks.pool.mockImplementation(function () { return {connect:vi.fn().mockRejectedValue(Error("connection failed")),end:vi.fn().mockRejectedValue(Object.assign(Error("PRIVATE_CLOSE"),{code:"EIO"}))}; });
 const result=await probeProductReadiness({...env,GUARD_DB_APP_APPROVAL_FILE:"test",GUARD_DB_APP_PASSWORD_FILE:"test"});
 expect(result.configuration).toBe("TARGET_VERIFIED");
 expect(result.appDatabase).toBe("DATABASE_PREFLIGHT_INCOMPLETE");
 expect(result.workerDatabase).toBe("DATABASE_PREFLIGHT_INCOMPLETE");
 expect(result.configurationDiagnostic).toEqual({phase:"DATABASE_CHECK",reason:"FILE_IO_ERROR"});
 expect(JSON.stringify(result)).not.toContain("PRIVATE_CLOSE");
});
