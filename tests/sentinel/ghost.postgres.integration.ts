import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { workerConfig } from "../../src/platform/config";
import { applyMigrations, migrationPlan } from "../../src/platform/migrations";
import { runSentinelWorker } from "../../worker/sentinel/runtime";
import {
  startGhostFixture,
  type GhostFixture,
} from "../../src/features/sentinel/ghost/decoy";
import { DEFAULT_GHOST_DECOY_PATH } from "../../src/features/sentinel/ghost/model";
import { seedRules } from "../../src/features/sentinel/detection/seeds";
import { setupGhostHarness, type GhostHarness } from "./ghost-pg-harness";

const hasPg = Boolean(
  process.env.SENTINEL_S07_PG_ADMIN_URL ||
  process.env.SENTINEL_S05_PG_ADMIN_URL,
);

const fixtures: GhostFixture[] = [];
afterEach(async () => {
  while (fixtures.length) {
    await fixtures.pop()!.stop();
  }
});

async function runWorkerOnce(
  h: GhostHarness,
  scope: GhostHarness["contextA"]["scope"],
  notBefore: string,
) {
  const plan = await migrationPlan();
  const control = Object.assign(new EventEmitter(), {
    connected: true,
    disconnect: () => {},
  });
  await runSentinelWorker({
    db: h.worker,
    pool: h.pools[1],
    migrations: plan.migrations,
    options: { ...workerConfig({}), healthPort: 0, pollMs: 50 },
    detection: { scope, notBefore },
    incidents: { scope, notBefore },
    workerId: randomUUID(),
    control,
    once: true,
    report: () => {},
  });
  await h.reopenWorker();
}

describe.skipIf(!hasPg)(
  "S07 Ghost Lite PostgreSQL + Loopback Decoy + Worker Acceptance",
  () => {
    let h: GhostHarness;
    let sourceA: { sourceId: string; credential: string };
    let decoyAId: string;
    let decoyAUpdatedAtRevision = 1;
    let activationTime: string;

    beforeAll(async () => {
      h = await setupGhostHarness();
    });
    afterAll(async () => {
      await h?.close();
    });

    it("0007_ghost migration up/up is idempotent, empty down reverses cleanly and re-applies, preserving 0001-0006", async () => {
      const plan = await migrationPlan();
      // Idempotent up/up
      await applyMigrations(h.migrator, plan.migrations, "up");
      // Later empty migrations (0008_internal_intelligence, 0009_external_intelligence) sit on top of 0007: reverse them first.
      await applyMigrations(h.migrator, plan.migrations, "down");
      await applyMigrations(h.migrator, plan.migrations, "down");
      // Down reverses only 0007_ghost when empty
      await applyMigrations(h.migrator, plan.migrations, "down");
      const versionsAfterDown = (
        await h.admin.query(
          "SELECT version FROM platform.schema_migrations ORDER BY version",
        )
      ).rows.map((r) => r.version);
      expect(versionsAfterDown).toEqual([
        "0001_foundation",
        "0002_telemetry",
        "0003_detection",
        "0004_incidents",
        "0005_response",
        "0006_notifications",
      ]);
      expect(
        (
          await h.admin.query(
            "SELECT to_regclass('sentinel.ghost_decoys') AS g, to_regclass('sentinel.incidents') AS i",
          )
        ).rows[0],
      ).toEqual({ g: null, i: "sentinel.incidents" });
      // Re-apply 0007_ghost
      await applyMigrations(h.migrator, plan.migrations, "up");
      const versionsAfterUp = (
        await h.admin.query(
          "SELECT version FROM platform.schema_migrations ORDER BY version",
        )
      ).rows.map((r) => r.version);
      expect(versionsAfterUp).toContain("0007_ghost");
    });

    it("S07-A1: end-to-end decoy hit -> S02 telemetry -> S03 controlled-decoy-v1 -> S04 incident -> live Ghost UI overview", async () => {
      sourceA = await h.telemetry.create(h.contextA, {
        name: "S07 H07 local fixture",
        environment: "local",
        origin: "controlled_test",
        retentionDays: 7,
        rateLimit: 1000,
      });

      // Created in safe default-disabled state
      const created = await h.ghost.command(h.contextA, {
        action: "create",
        sourceId: sourceA.sourceId,
        name: "Local Ghost Decoy",
        ownedApplicationConfirmed: true,
        h07ProofId: "h07-local-acceptance",
      });
      decoyAId = created.decoy.decoyId;
      expect(created.decoy.enabled).toBe(false);
      expect(created.decoy.connectionStatus).toBe("disabled");
      expect(created.decoy.decoyPath).toBe(DEFAULT_GHOST_DECOY_PATH);
      expect(created.decoy.origin).toBe("controlled_test");

      // Explicit opt-in enable
      const enabled = await h.ghost.command(h.contextA, {
        action: "enable",
        decoyId: decoyAId,
        expectedRevision: 1,
        ownedApplicationConfirmed: true,
      });
      decoyAUpdatedAtRevision = enabled.decoy.revision;
      expect(enabled.decoy.enabled).toBe(true);
      expect(enabled.decoy.connectionStatus).toBe("not_configured"); // awaiting first contact

      // Seed rules: controlled-decoy-v1 MUST start as DRAFT
      const seedResult = await h.detection.command(h.contextA, {
        action: "seed",
      });
      expect(seedResult).toMatchObject({
        status: "DRAFT",
        automaticallyEnabled: false,
      });
      const rules = await h.detection.rules(h.contextA);
      const decoyRule = rules.find(
        (r) => r.definition.name === seedRules[2].definition.name,
      )!;
      expect(decoyRule.status).toBe("DRAFT");

      // Explicitly activate controlled-decoy-v1 ONLY in approved controlled test project A
      activationTime = new Date(Date.now() - 5000).toISOString();
      await h.detection.command(h.contextA, {
        action: "enable",
        ruleId: decoyRule.ruleId,
        expectedRevision: decoyRule.revision,
      });

      const fx = await startGhostFixture({
        enabled: true,
        ownedApplicationConfirmed: true,
        ingestEndpoint: h.ingestUrl,
        credential: sourceA.credential,
        rateLimitPerMinute: 30,
      });
      fixtures.push(fx);

      // Fire one real controlled HTTP decoy request with forbidden canary secrets to prove redaction
      const res = await fetch(`${fx.url}?password=CanaryPassword123`, {
        headers: {
          authorization: "Bearer canary-jwt-token",
          cookie: "session=canary-cookie",
          "x-forwarded-for": "198.51.100.77",
          "x-wetscan-synthetic-test": "1",
        },
      });
      expect(res.status).toBe(200);
      expect(fx.stats().emissionsSucceeded).toBe(1);

      await runWorkerOnce(h, h.contextA.scope, activationTime);

      const ov = await h.ghost.overview(h.contextA);
      expect(ov.decoys[0].connectionStatus).toBe("connected");
      expect(ov.decoys[0].lastHitAt).not.toBeNull();
      expect(ov.ruleStatus).toBe("ENABLED");
      expect(ov.hits).toHaveLength(1);
      expect(ov.hits[0].event.kind).toBe("ghost.decoy_triggered");
      expect(ov.hits[0].event.request?.routeTemplate).toBe(
        DEFAULT_GHOST_DECOY_PATH,
      );
      expect(ov.hits[0].evidence.origin).toBe("controlled_test");
      expect(JSON.stringify(ov.hits[0])).not.toMatch(
        /CanaryPassword123|canary-jwt-token|canary-cookie|198\.51\.100\.77/,
      );
      expect(ov.alerts).toHaveLength(1);
      expect(ov.alerts[0].category).toBe("decoy");
      expect(ov.incidents).toHaveLength(1);
      expect(ov.incidents[0].category).toBe("decoy");
      expect(ov.incidents[0].origin).toBe("controlled_test");
      expect(ov.incidents[0].verificationStatus).toBe("not_requested");
      expect(ov.incidents[0].evidenceIds).toHaveLength(1);
      expect(ov.audit.map((a) => a.action)).toEqual(["enabled", "created"]);

      // S05 & S06 isolation: zero automatic responses or notifications
      expect(
        Number(
          (
            await h.admin.query(
              "SELECT count(*) n FROM sentinel.response_actions",
            )
          ).rows[0].n,
        ),
      ).toBe(0);
      expect(
        Number(
          (
            await h.admin.query(
              "SELECT count(*) n FROM sentinel.notification_deliveries",
            )
          ).rows[0].n,
        ),
      ).toBe(0);
    });

    it("S07-A2: duplicate/replayed hits do not create duplicate incidents or alert spam; rate limit bounds bursts", async () => {
      const fx = await startGhostFixture({
        enabled: true,
        ownedApplicationConfirmed: true,
        ingestEndpoint: h.ingestUrl,
        credential: sourceA.credential,
        rateLimitPerMinute: 4,
      });
      fixtures.push(fx);

      const corr = randomUUID();
      await fetch(fx.url, { headers: { "x-wetscan-correlation-id": corr } });
      await fetch(fx.url, { headers: { "x-wetscan-correlation-id": corr } });
      expect(fx.stats().hitsDeduplicated).toBe(1);
      expect(fx.stats().emissionsSucceeded).toBe(1);

      // Direct S02 batch replay returns duplicate: true
      const nowIso = new Date().toISOString();
      const batch = {
        schemaVersion: 1,
        batchId: randomUUID(),
        sentAt: nowIso,
        events: [
          {
            schemaVersion: 1,
            eventId: randomUUID(),
            projectId: h.contextA.scope.projectId,
            occurredAt: nowIso,
            kind: "ghost.decoy_triggered",
            request: {
              method: "GET",
              routeTemplate: DEFAULT_GHOST_DECOY_PATH,
              statusCode: 200,
            },
            attributes: { reasonCode: "decoy_hit" },
          },
        ],
      };
      const firstIngest = await h.telemetry.ingest(sourceA.credential, batch);
      const replayIngest = await h.telemetry.ingest(sourceA.credential, batch);
      expect(firstIngest.duplicate).toBe(false);
      expect(replayIngest.duplicate).toBe(true);

      // Two concurrent hits in same 60s window + 5th hit rate-limited at decoy
      await Promise.all([fetch(fx.url), fetch(fx.url), fetch(fx.url)]);
      const bursted = await fetch(fx.url);
      expect(bursted.status).toBe(429);

      await runWorkerOnce(h, h.contextA.scope, activationTime);
      const ov = await h.ghost.overview(h.contextA);
      // Coalesced inside the existing 60s window / cooldown -> no incident or alert spam
      expect(ov.alerts.length).toBeLessThanOrEqual(2);
      expect(ov.incidents.length).toBeLessThanOrEqual(2);
      expect(ov.hits.length).toBeGreaterThanOrEqual(4);
    });

    it("S07-A4: benign scanner/crawler hit is classified safely, not blocked, and never marked compromised", async () => {
      const fx = await startGhostFixture({
        enabled: true,
        ownedApplicationConfirmed: true,
        ingestEndpoint: h.ingestUrl,
        credential: sourceA.credential,
        rateLimitPerMinute: 30,
      });
      fixtures.push(fx);

      const botRes = await fetch(fx.url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        },
      });
      expect(botRes.status).toBe(200);
      await runWorkerOnce(h, h.contextA.scope, activationTime);
      const ov = await h.ghost.overview(h.contextA);
      const latestHit = ov.hits[0];
      expect(latestHit.event.attributes?.signalClassification).toBe(
        "automated_crawler_or_scanner",
      );
      expect(JSON.stringify(latestHit)).not.toContain("Googlebot");
      expect(ov.falsePositivePolicy).toContain("never proof of compromise");
      expect(
        Number(
          (
            await h.admin.query(
              "SELECT count(*) n FROM sentinel.response_actions",
            )
          ).rows[0].n,
        ),
      ).toBe(0);
    });

    it("S07-A3: disabled decoy, disabled source, revoked credential, and unknown target fail closed", async () => {
      const fx = await startGhostFixture({
        enabled: false,
        ownedApplicationConfirmed: true,
        ingestEndpoint: h.ingestUrl,
        credential: sourceA.credential,
      });
      fixtures.push(fx);

      // Disabled decoy -> 404, 0 emissions
      expect((await fetch(fx.url)).status).toBe(404);
      expect(fx.stats().emissionsSucceeded).toBe(0);

      // Unknown path even when enabled -> 404, 0 emissions
      fx.setEnabled(true, true);
      expect((await fetch(`${fx.origin}/unknown-path`)).status).toBe(404);
      expect(fx.stats().emissionsSucceeded).toBe(0);

      // Disable decoy in store -> disable source -> cannot re-enable decoy while source disabled
      await h.ghost.command(h.contextA, {
        action: "disable",
        decoyId: decoyAId,
        expectedRevision: decoyAUpdatedAtRevision,
      });
      decoyAUpdatedAtRevision++;
      await h.telemetry.change(h.contextA, sourceA.sourceId, "disable");
      await expect(
        h.ghost.command(h.contextA, {
          action: "enable",
          decoyId: decoyAId,
          expectedRevision: decoyAUpdatedAtRevision,
          ownedApplicationConfirmed: true,
        }),
      ).rejects.toMatchObject({ code: "source_disabled" });

      // Hitting decoy while source is disabled -> ingest rejects 401 -> failed emission, no persisted event
      const beforeEvents = (await h.ghost.overview(h.contextA)).hits.length;
      await fetch(fx.url);
      expect(fx.stats().emissionsFailed).toBe(1);
      expect((await h.ghost.overview(h.contextA)).hits).toHaveLength(
        beforeEvents,
      );

      // Re-enable source then revoke credential -> fails closed
      await h.telemetry.change(h.contextA, sourceA.sourceId, "enable");
      await h.telemetry.change(h.contextA, sourceA.sourceId, "revoke");
      await fetch(fx.url);
      expect(fx.stats().emissionsFailed).toBe(2);
      expect((await h.ghost.overview(h.contextA)).hits).toHaveLength(
        beforeEvents,
      );
    });

    it("S07-A5: cross-project isolation, RLS enforcement, append-only audit, DRAFT rule preservation, and populated down refusal", async () => {
      const sourceB = await h.telemetry.create(h.contextB, {
        name: "Project B source",
        environment: "local",
        origin: "controlled_test",
        retentionDays: 7,
        rateLimit: 1000,
      });
      await h.detection.command(h.contextB, { action: "seed" });

      // Project B cannot see Project A decoys/hits/alerts/incidents/audit
      const ovB = await h.ghost.overview(h.contextB);
      expect(ovB.decoys).toHaveLength(0);
      expect(ovB.hits).toHaveLength(0);
      expect(ovB.alerts).toHaveLength(0);
      expect(ovB.incidents).toHaveLength(0);
      expect(ovB.audit).toHaveLength(0);
      expect(ovB.ruleStatus).toBe("DRAFT");

      // Project B cannot bind Project A's sourceId or mutate Project A's decoy
      await expect(
        h.ghost.command(h.contextB, {
          action: "create",
          sourceId: sourceA.sourceId,
          name: "Cross tenant bind",
          ownedApplicationConfirmed: true,
        }),
      ).rejects.toMatchObject({ code: "source_not_found" });
      await expect(
        h.ghost.command(h.contextB, {
          action: "enable",
          decoyId: decoyAId,
          expectedRevision: decoyAUpdatedAtRevision,
          ownedApplicationConfirmed: true,
        }),
      ).rejects.toMatchObject({ code: "not_found" });

      // Event in Project B while controlled-decoy-v1 is DRAFT produces 0 alerts/incidents
      const fxB = await startGhostFixture({
        enabled: true,
        ownedApplicationConfirmed: true,
        ingestEndpoint: h.ingestUrl,
        credential: sourceB.credential,
      });
      fixtures.push(fxB);
      await fetch(fxB.url);
      await runWorkerOnce(
        h,
        h.contextB.scope,
        new Date(Date.now() - 5000).toISOString(),
      );
      const ovBAfter = await h.ghost.overview(h.contextB);
      expect(ovBAfter.hits).toHaveLength(1);
      expect(ovBAfter.alerts).toHaveLength(0);
      expect(ovBAfter.incidents).toHaveLength(0);

      // Direct PostgreSQL RLS & least-privilege enforcement
      await h.app.scoped(h.contextB.scope, async (tx) => {
        expect(
          (await h.app.query(tx, "SELECT * FROM sentinel.ghost_decoys")).rows,
        ).toHaveLength(0);
        await expect(
          h.app.query(tx, "DELETE FROM sentinel.ghost_audit"),
        ).rejects.toThrow();
        await expect(
          h.app.query(
            tx,
            "UPDATE sentinel.ghost_decoys SET origin='runtime' WHERE decoy_id=$1",
            [decoyAId],
          ),
        ).rejects.toThrow();
      });

      // Worker role cannot mutate ghost_decoys or ghost_audit
      await h.worker.scoped(h.contextA.scope, async (tx) => {
        expect(
          (await h.worker.query(tx, "SELECT * FROM sentinel.ghost_decoys"))
            .rows,
        ).toHaveLength(1);
        await expect(
          h.worker.query(
            tx,
            "UPDATE sentinel.ghost_decoys SET enabled=true WHERE decoy_id=$1",
            [decoyAId],
          ),
        ).rejects.toThrow();
        await expect(
          h.worker.query(tx, "DELETE FROM sentinel.ghost_audit"),
        ).rejects.toThrow();
      });

      // Populated 0007_ghost down migration must refuse cleanly (after the empty 0008 is reversed and re-applied)
      const plan = await migrationPlan();
      await applyMigrations(h.migrator, plan.migrations, "down");
      await applyMigrations(h.migrator, plan.migrations, "down");
      await expect(
        applyMigrations(h.migrator, plan.migrations, "down"),
      ).rejects.toThrow("target_denied");
      await applyMigrations(h.migrator, plan.migrations, "up");
    });

    it("S07 worker crash/restart preserves single incident without duplication", async () => {
      // Enable Project B's decoy rule & decoy, emit a hit, run worker, restart worker, run again
      const rulesB = await h.detection.rules(h.contextB);
      const decoyRuleB = rulesB.find(
        (r) => r.definition.name === seedRules[2].definition.name,
      )!;
      const enableTime = new Date(Date.now() - 1000).toISOString();
      await h.detection.command(h.contextB, {
        action: "enable",
        ruleId: decoyRuleB.ruleId,
        expectedRevision: decoyRuleB.revision,
      });

      const bSources = await h.telemetry.sources(h.contextB);
      const rotated = await h.telemetry.change(
        h.contextB,
        bSources[0].sourceId,
        "rotate",
      );
      const fx = await startGhostFixture({
        enabled: true,
        ownedApplicationConfirmed: true,
        ingestEndpoint: h.ingestUrl,
        credential: rotated.credential!,
      });
      fixtures.push(fx);
      await fetch(fx.url);

      // Run worker pass 1, then reopen/restart worker pool and run pass 2
      await runWorkerOnce(h, h.contextB.scope, enableTime);
      await runWorkerOnce(h, h.contextB.scope, enableTime);
      const ov = await h.ghost.overview(h.contextB);
      expect(ov.alerts).toHaveLength(1);
      expect(ov.incidents).toHaveLength(1);
    });

    it("S07 real CLI decoy process: refuses startup without opt-in and runs full hit -> PostgreSQL -> clean shutdown", async () => {
      // 1. Fail closed without SENTINEL_GHOST_ENABLED=1
      const denied = await new Promise<{ code: number | null; err: string }>(
        (ok) => {
          const c = spawn(
            process.execPath,
            ["--import", "tsx", "scripts/sentinel-ghost-fixture.ts"],
            {
              env: {
                PATH: process.env.PATH,
                SystemRoot: process.env.SystemRoot,
                SENTINEL_GHOST_ENABLED: "0",
              } as unknown as NodeJS.ProcessEnv,
              stdio: ["ignore", "pipe", "pipe"],
            },
          );
          let err = "";
          c.stderr.on("data", (d) => (err += d));
          c.on("exit", (code) => ok({ code, err }));
        },
      );
      expect(denied.code).toBe(2);
      expect(denied.err).toContain("ghost_opt_in_required");

      // 2. Start real CLI fixture with credential file and loopback ingest
      const dir = await mkdtemp(join(tmpdir(), "wetscan-s07-proc-"));
      try {
        const bSources = await h.telemetry.sources(h.contextB);
        const rotated = await h.telemetry.change(
          h.contextB,
          bSources[0].sourceId,
          "rotate",
        );
        const credFile = join(dir, "ingest.cred");
        await writeFile(credFile, rotated.credential!, "utf8");

        const child = spawn(
          process.execPath,
          ["--import", "tsx", "scripts/sentinel-ghost-fixture.ts"],
          {
            env: {
              PATH: process.env.PATH,
              SystemRoot: process.env.SystemRoot,
              SENTINEL_GHOST_ENABLED: "1",
              SENTINEL_GHOST_OWNED_APP_CONFIRMED: "1",
              SENTINEL_GHOST_PORT: "0",
              SENTINEL_INGEST_ENDPOINT: h.ingestUrl,
              SENTINEL_INGEST_CREDENTIAL_FILE: credFile,
            } as unknown as NodeJS.ProcessEnv,
            stdio: ["ignore", "pipe", "pipe", "ipc"],
          },
        );
        const started = await new Promise<{ url: string }>(
          (resolve, reject) => {
            let stdout = "";
            let stderr = "";
            child.stdout?.on("data", (d) => {
              stdout += d;
              const line = stdout
                .split(/\r?\n/)
                .find((l) => l.includes("ghost_fixture_started"));
              if (line) resolve(JSON.parse(line));
            });
            child.stderr?.on("data", (d) => (stderr += d));
            child.on("exit", (code) =>
              reject(new Error(`early_exit_${code}:${stderr}`)),
            );
          },
        );

        const beforeHits = (await h.ghost.overview(h.contextB)).hits.length;
        const hitRes = await fetch(started.url);
        expect(hitRes.status).toBe(200);
        const afterHits = (await h.ghost.overview(h.contextB)).hits.length;
        expect(afterHits).toBe(beforeHits + 1);

        const exitCode = await new Promise<number | null>((ok) => {
          child.on("exit", (code) => ok(code));
          child.send({ type: "sentinel.shutdown" });
        });
        expect(exitCode).toBe(0);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  },
);
