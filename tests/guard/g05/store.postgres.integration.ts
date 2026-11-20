import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { G05Scope } from "../../../src/features/guard/g05/contracts";
import { G05Service } from "../../../src/features/guard/g05/service";
import { G05PostgresStore } from "../../../src/features/guard/g05/store";
import { openG05ForTests } from "./pg-env";

const SCOPE_A: G05Scope = { workspaceId: "github-user-1:ws-a", projectId: "github-91001" };
const SCOPE_B: G05Scope = { workspaceId: "github-user-2:ws-b", projectId: "github-91002" };

describe("G05 PostgreSQL RLS store isolation, vault storage & revision controls", () => {
  let ctx: Awaited<ReturnType<typeof openG05ForTests>>;
  let appService: G05Service;
  let appStore: G05PostgresStore;
  let workerStore: G05PostgresStore;

  beforeAll(async () => {
    ctx = await openG05ForTests();
    appStore = new G05PostgresStore(ctx.db.app);
    workerStore = new G05PostgresStore(ctx.db.worker);
    appService = new G05Service(appStore, {
      vaultKey: ctx.vaultKey,
      localPin: ctx.localPin,
    });
  });

  afterAll(async () => {
    await ctx?.db.close();
  });

  it("enforces strict cross-workspace/project isolation, sealed secret privacy, and optimistic revision locking", async () => {
    const existing = await appService.store.getTarget(SCOPE_A, "staging-rls");
    const nextRev = existing?.revision ?? 0;

    const target = await appService.saveTarget(SCOPE_A, "actor-a", {
      id: "staging-rls",
      name: "RLS Staging",
      environment: "local_synthetic",
      origin: ctx.localPin!.allowedOrigin,
      serviceIdentity: ctx.localPin!.serviceIdentity,
      owner: "sec-team",
      status: "active",
      expectedRevision: nextRev,
      reason: "RLS verification setup",
      config: {
        allowedRoutes: ["/healthz", "/api/auth/login", "/api/orders", "/api/orders/*"],
        allowedMethods: ["GET", "POST"],
        maxRequests: 50,
        maxConcurrency: 2,
        rateLimitRps: 20,
        maxResponseBytes: 32768,
        timeoutMs: 3000,
        approvedCategories: ["dast_header", "dast_auth", "auth_matrix"],
        allowedSyntheticResources: ["order"],
        cleanupPolicy: "delete_created_and_revoke_sessions",
      },
    });
    expect(target.revision).toBe(nextRev + 1);

    // Concurrent revision conflict returns 409
    await expect(
      appService.saveTarget(SCOPE_A, "actor-a", {
        id: "staging-rls",
        name: "Stale update",
        environment: "local_synthetic",
        origin: ctx.localPin!.allowedOrigin,
        serviceIdentity: ctx.localPin!.serviceIdentity,
        owner: "sec-team",
        status: "active",
        expectedRevision: 0,
        reason: "stale",
        config: target.config,
      }),
    ).rejects.toMatchObject({ status: 409 });

    // Cross-scope reads return empty / null (PostgreSQL RLS isolates rows)
    expect(await appStore.getTarget(SCOPE_B, "staging-rls")).toBeNull();
    expect(await appStore.listTargets(SCOPE_B)).toEqual([]);

    // Sealed test account never returns plaintext secret or ciphertext through app APIs
    const rawSecret = "syn_secret_rls_never_leaked_999";
    const acct = await appService.saveTestAccount(SCOPE_A, "actor-a", {
      targetId: "staging-rls",
      role: "user_a",
      label: "Synthetic A",
      usernameRef: "syn-user-a@synthetic.wetscan.invalid",
      authStrategy: "bearer_login",
      loginPath: "/api/auth/login",
      secret: rawSecret,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(acct.credentialConfigured).toBe(true);
    expect(JSON.stringify(acct)).not.toContain(rawSecret);

    // App DB role is forbidden from calling worker-only credential retrieval
    await expect(
      appStore.loadSealedAccountsForWorker(SCOPE_A, "staging-rls"),
    ).rejects.toThrow();

    // Worker DB role CAN read sealed ciphertext for target A, and RLS isolates SCOPE_B
    const workerSealedA = await workerStore.loadSealedAccountsForWorker(SCOPE_A, "staging-rls");
    expect(workerSealedA.some((x) => x.id === acct.id && x.credentialCiphertext?.startsWith("g05v1:"))).toBe(true);
    expect(JSON.stringify(workerSealedA)).not.toContain(rawSecret);
    expect(await workerStore.loadSealedAccountsForWorker(SCOPE_B, "staging-rls")).toEqual([]);
  });

  it("denies grant issuance and execution for unpinned local services (e.g. Postgres port 55436)", async () => {
    await expect(
      appService.saveTarget(SCOPE_A, "actor-a", {
        id: "rogue-pg",
        name: "Unauthorized Local PG",
        environment: "local_synthetic",
        origin: "http://127.0.0.1:55436",
        serviceIdentity: "rogue-service",
        owner: "attacker",
        status: "active",
        expectedRevision: 0,
        reason: "should deny",
        config: {
          allowedRoutes: ["/"],
          allowedMethods: ["GET"],
          maxRequests: 10,
          maxConcurrency: 1,
          rateLimitRps: 5,
          maxResponseBytes: 4096,
          timeoutMs: 1000,
          approvedCategories: ["dast_header"],
          allowedSyntheticResources: ["none"],
          cleanupPolicy: "delete_created_and_revoke_sessions",
        },
      }),
    ).rejects.toMatchObject({ status: 403, code: "local_synthetic_not_authorized" });
  });
});
