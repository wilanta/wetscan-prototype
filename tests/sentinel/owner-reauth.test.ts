import { createCipheriv, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  AUTH_CALLBACK,
  AUTH_ORIGIN,
  checkRecoveryDelta,
  decodeAuth,
  validateDecodedRecords,
  validateWindowEvidence,
  historicalPin,
} from "../../scripts/sentinel-owner-reauth";
import { AuthWindowPolicy } from "../../scripts/sentinel-owner-reauth-app.mjs";

const now = 2_000_000_000_000;
const historical = "session-" + "a".repeat(64) + ".bin";
const archived = "session-" + "b".repeat(64) + ".bin";
const candidate = "session-" + "c".repeat(64) + ".bin";
const profileName = "user-187839747.bin";
const hash = "d".repeat(64);
function fixture(): Parameters<typeof checkRecoveryDelta>[0] {
  const profile = {
    githubId: 187839747,
    login: "owner",
    workspace: "test",
    completedAt: "2026-11-16",
    installationId: 123,
    repositories: [{ id: 998736528 }],
    email: "",
    securityNotifications: true,
    productUpdates: false,
  };
  return {
    before: {
      records: { [historical]: hash, [profileName]: hash },
      directories: ["canvas-graphs-v1"],
    },
    after: {
      records: {
        [historical]: hash,
        [profileName]: "e".repeat(64),
        [candidate]: hash,
      },
      directories: ["canvas-graphs-v1"],
    },
    archivedName: archived,
    candidateName: candidate,
    oldPins: { cookie: hash, metadata: hash },
    currentOldPins: { cookie: hash, metadata: hash },
    previousProfile: structuredClone(profile),
    profile,
    session: {
      githubId: 187839747,
      workspace: "",
      expiresAt: now + 86_400_000,
      userToken: "SYNTHETIC_ACCESS_NEVER_REAL",
      refreshToken: "SYNTHETIC_REFRESH_NEVER_REAL",
      tokenExpiresAt: now + 60 * 60_000,
    },
    metadata: {
      schemaVersion: 1,
      origin: AUTH_ORIGIN,
      callbackUrl: AUTH_CALLBACK,
      recordedAt: new Date(now - 1000).toISOString(),
    },
    startedAt: now - 10000,
    candidateMtime: now - 5000,
    now,
  };
}
describe("offline auth-recovery preservation and separated lifetime contracts", () => {
  it("normalizes historical pin path keys without allowing duplicate aliases", () => {
    const file = resolve("synthetic-cookie");
    expect(historicalPin({ [file]: hash }, file)).toBe(hash);
    expect(() => historicalPin({}, file)).toThrow();
    if (process.platform === "win32") {
      const slash = file.replaceAll("\\", "/");
      expect(historicalPin({ [slash]: hash }, file)).toBe(hash);
      expect(() =>
        historicalPin({ [file]: hash, [slash]: hash }, file),
      ).toThrow();
    }
  });
  it("accepts exactly the new candidate and semantic profile equality despite random ciphertext", () => {
    expect(checkRecoveryDelta(fixture())).toMatchObject({
      status: "PASS_LOCAL_SESSION_WITH_APPROVED_ARCHIVE_DISPOSITION",
      completeHistoricalActiveFilePreservation: false,
      provisioningAuthorized: false,
    });
  });
  const scenarios: [string, (f: ReturnType<typeof fixture>) => void][] = [
    [
      "canonical cookie changed",
      (f) => {
        f.currentOldPins.cookie = "different";
      },
    ],
    [
      "canonical metadata removed",
      (f) => {
        delete f.currentOldPins.metadata;
      },
    ],
    [
      "archived record reappeared",
      (f) => {
        f.after.records[archived] = hash;
      },
    ],
    [
      "second missing historical record",
      (f) => {
        delete f.after.records[historical];
      },
    ],
    [
      "historical ciphertext modified",
      (f) => {
        f.after.records[historical] = "different";
      },
    ],
    [
      "unexpected new record",
      (f) => {
        f.after.records["session-" + "f".repeat(64) + ".bin"] = hash;
      },
    ],
    [
      "candidate cookie mismatches new file",
      (f) => {
        f.candidateName = "session-" + "0".repeat(64) + ".bin";
      },
    ],
    [
      "candidate duplicates historical session",
      (f) => {
        f.candidateName = historical;
      },
    ],
    [
      "wrong owner",
      (f) => {
        f.session.githubId = 1;
      },
    ],
    [
      "wrong workspace",
      (f) => {
        f.profile.workspace = "other";
      },
    ],
    [
      "wrong repository",
      (f) => {
        f.profile.repositories = [];
      },
    ],
    [
      "wrong origin",
      (f) => {
        f.metadata.origin = "http://127.0.0.1:3000";
      },
    ],
    [
      "wrong callback",
      (f) => {
        f.metadata.callbackUrl = AUTH_ORIGIN + "/wrong";
      },
    ],
    [
      "insufficient lifetime",
      (f) => {
        f.session.tokenExpiresAt = now + 30 * 60000 - 1;
      },
    ],
    [
      "expired session",
      (f) => {
        f.session.expiresAt = now;
      },
    ],
    [
      "pending OAuth flow",
      (f) => {
        f.session.flow = { state: "synthetic" };
      },
    ],
    [
      "profile setting changed",
      (f) => {
        f.profile.productUpdates = true;
      },
    ],
    [
      "candidate not created during login",
      (f) => {
        f.candidateMtime = f.startedAt - 2001;
      },
    ],
    [
      "future capture timestamp",
      (f) => {
        f.metadata.recordedAt = new Date(now + 1).toISOString();
      },
    ],
    [
      "unexpected directory",
      (f) => {
        f.after.directories.push("unexpected");
      },
    ],
  ];
  it.each(scenarios)("rejects %s", (_, mutate) => {
    const f = fixture();
    mutate(f);
    expect(() => checkRecoveryDelta(f)).toThrow();
  });
  it("allows only the profile login field to change", () => {
    const f = fixture();
    f.profile.login = "updated-owner-name";
    expect(checkRecoveryDelta(f).newUniqueOwnerSession).toBe(true);
  });
  it.each([30, 39, 40, 60])(
    "separates recovery>=30 and provisioning-entry>=40 at %i minutes",
    (minutes) => {
      const f = fixture();
      f.session.tokenExpiresAt = now + minutes * 60000;
      expect(checkRecoveryDelta(f).provisioningEntryLifetimeEligible).toBe(
        minutes >= 40,
      );
    },
  );
  it("sanitized results contain no candidate credentials or decrypted profile", () => {
    const out = JSON.stringify(checkRecoveryDelta(fixture()));
    expect(out).not.toContain("SYNTHETIC_");
    expect(out).not.toContain("repositories");
  });
  it("rejects unreadable encrypted records and wrong AAD without leaking bytes", () => {
    for (const b of [
      Buffer.alloc(0),
      Buffer.from("SENSITIVE_SYNTHETIC_RECORD"),
    ])
      expect(() => decodeAuth(b, historical, "test-secret")).toThrow(
        "auth_recovery_validation_failed",
      );
  });
  it("random-IV encryption changes bytes while preserving semantic payload", () => {
    const secret = "SYNTHETIC_ONLY_SECRET_32_CHARS_LONG";
    const seal = (iv: Buffer) => {
      const c = createCipheriv(
        "aes-256-gcm",
        createHash("sha256").update(secret).digest(),
        iv,
      );
      c.setAAD(Buffer.from(profileName.slice(0, -4)));
      const data = Buffer.concat([
        c.update(JSON.stringify(fixture().profile)),
        c.final(),
      ]);
      return Buffer.concat([iv, c.getAuthTag(), data]);
    };
    const a = seal(Buffer.alloc(12, 1)),
      b = seal(Buffer.alloc(12, 2));
    expect(a.equals(b)).toBe(false);
    expect(decodeAuth(a, profileName, secret)).toEqual(
      decodeAuth(b, profileName, secret),
    );
  });
  it("does not silently skip malformed decoded sessions", () => {
    expect(() =>
      validateDecodedRecords({
        [profileName]: fixture().profile,
        [historical]: { expiresAt: "invalid" },
      }),
    ).toThrow();
  });
});
describe("auth-only route and provider policy (no servers or requests)", () => {
  function window() {
    const p = new AuthWindowPolicy();
    p.route("POST", "/api/auth/github/start");
    p.route("GET", "/api/auth/github/callback");
    return p;
  }
  const exchange = {
    method: "POST",
    body: JSON.stringify({
      code: "SYNTHETIC_CODE",
      code_verifier: "SYNTHETIC_PKCE",
    }),
  };
  it("allows exactly one authorization-code exchange and owner identity call", () => {
    const p = window();
    expect(
      p.provider("https://github.com/login/oauth/access_token", exchange),
    ).toBe("exchange");
    expect(p.provider("https://api.github.com/user")).toBe("identity");
    expect(p.receipt(true).status).toBe("CALLBACK_COMPLETE");
  });
  it.each([
    "/api/auth/logout",
    "/api/sentinel/projects/github-998736528/rules",
    "/api/onboarding/workspace",
  ])("blocks unrelated route %s", (p) => {
    expect(() => window().route("POST", p)).toThrow();
  });
  it("replaces full application shell with a static completion page", () => {
    expect(window().route("GET", "/app")).toBe("complete");
  });
  it("never calls session-store APIs for login-page onboarding", () => {
    expect(window().route("GET", "/api/onboarding")).toBe("anonymous");
  });
  it("blocks refresh even if an expired token reaches userToken", () => {
    expect(() =>
      window().provider("https://github.com/login/oauth/access_token", {
        method: "POST",
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: "SYNTHETIC",
        }),
      }),
    ).toThrow();
  });
  it.each([
    "https://api.github.com/repos/owner/repo",
    "https://example.com",
    "http://localhost:55432",
  ])("blocks unrelated provider URL %s", (url) => {
    expect(() => window().provider(url)).toThrow();
  });
  it("blocks repeated OAuth start/callback and exchange; never retries", () => {
    const p = window();
    expect(() => p.route("POST", "/api/auth/github/start")).toThrow();
    expect(() => p.route("GET", "/api/auth/github/callback")).toThrow();
    const q = window();
    q.provider("https://github.com/login/oauth/access_token", exchange);
    expect(() =>
      q.provider("https://github.com/login/oauth/access_token", exchange),
    ).toThrow();
  });
  it("OAuth failure, missing identity or timeout cannot produce success", () => {
    for (const p of [new AuthWindowPolicy(), window()])
      expect(p.receipt(false).status).toBe("NOT_VERIFIED");
    const p = window();
    p.provider("https://github.com/login/oauth/access_token", exchange);
    expect(p.receipt(true).status).toBe("NOT_VERIFIED");
  });
  it("denied operations prevent success even after valid calls", () => {
    const p = window();
    p.provider("https://github.com/login/oauth/access_token", exchange);
    p.provider("https://api.github.com/user");
    expect(() => p.provider("https://api.github.com/user")).toThrow();
    expect(p.receipt(true).status).toBe("NOT_VERIFIED");
  });
});
describe("mandatory window and cleanup evidence", () => {
  const run = "SYNTHETIC_RUN";
  const stopped = { status: "STOPPED", outputDirectory: run };
  const success = {
    status: "CALLBACK_COMPLETE",
    starts: 1,
    callbacks: 1,
    tokenExchanges: 1,
    identities: 1,
    blockedOperations: 0,
  };
  const watchdog = { status: "CLEANUP_COMPLETE", expired: false };
  it("accepts complete cleanup evidence", () => {
    expect(() =>
      validateWindowEvidence(stopped, success, watchdog, false, run),
    ).not.toThrow();
  });
  it.each([{}, { status: "NOT_VERIFIED" }, { ...watchdog, expired: true }])(
    "rejects missing, failed or timed-out watchdog %j",
    (wd) => {
      expect(() =>
        validateWindowEvidence(stopped, success, wd, false, run),
      ).toThrow();
    },
  );
  it("does not let a callback receipt mask a later forbidden operation", () => {
    expect(() =>
      validateWindowEvidence(stopped, success, watchdog, true, run),
    ).toThrow();
  });
  it("rejects failed owned-process cleanup", () => {
    expect(() =>
      validateWindowEvidence({}, success, watchdog, false, run),
    ).toThrow();
  });
  it("rejects OAuth errors and ambiguous repeated callbacks", () => {
    for (const outcome of [
      { ...success, status: "NOT_VERIFIED" },
      { ...success, callbacks: 2 },
    ])
      expect(() =>
        validateWindowEvidence(stopped, outcome, watchdog, false, run),
      ).toThrow();
  });
});
describe.skipIf(process.platform !== "win32")(
  "actual PS5.1 default-off exit propagation with mock native checker",
  () => {
    const exec = promisify(execFile);
    it.each([
      "success",
      "primary_failure",
      "cleanup_failure",
      "receipt_failure",
      "missing_validation",
    ])("actual final PowerShell gate propagates %s", async (scenario) => {
      const text = await readFile(
        resolve("scripts/Invoke-S04OwnerReauth.ps1"),
        "utf8",
      );
      const gate = text.slice(
        text.lastIndexOf(
          "if($primary -or $cleanupErrors.Count -or -not $verified)",
        ),
      );
      expect(gate).toContain("exit 1");
      const script = `$stage='synthetic';$primary=$null;$verified=$true;$cleanupErrors=New-Object Collections.Generic.List[string]\n${scenario === "primary_failure" ? "$primary=@{stage='oauth'}" : scenario === "missing_validation" ? "$verified=$false" : scenario === "cleanup_failure" || scenario === "receipt_failure" ? "$cleanupErrors.Add('synthetic_failure')" : ""}\n${gate}`;
      const result = await exec(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
        { windowsHide: true, timeout: 10000 },
      )
        .then((r) => ({ ...r, code: 0 }))
        .catch((e) => e);
      expect(result.code).toBe(scenario === "success" ? 0 : 1);
      if (scenario !== "success")
        expect(result.stdout).toContain("NOT_VERIFIED");
    });
    it.each([true, false])(
      "preflight success=%s never starts app and preserves exit status",
      async (success) => {
        const dir = await mkdtemp(join(tmpdir(), "wetscan-reauth-offline-"));
        try {
          const scripts = join(dir, "scripts");
          await mkdir(scripts);
          const pins: Record<string, string> = {};
          for (const name of [
            "Invoke-S04OwnerReauth.ps1",
            "sentinel-owner-reauth.ts",
            "sentinel-owner-reauth-app.mjs",
            "sentinel-owner-reauth-watchdog.ps1",
            "sentinel-provision-common.ps1",
            "sentinel-provision-private.ps1",
          ]) {
            const original = await readFile(resolve("scripts", name));
            // Only fixture path/ACL dependencies are mocked; execute the actual
            // procedure and its native-child/exit handling without a live mode.
            const bytes =
              name === "sentinel-provision-common.ps1"
                ? Buffer.concat([
                    original,
                    Buffer.from(
                      "\nfunction Assert-ProvisionPrivatePath { return $args[0] }\nfunction Assert-ProvisionPrivateFile {}\n",
                    ),
                  ])
                : original;
            const dest = join(scripts, name);
            await writeFile(dest, bytes);
            pins[dest] = createHash("sha256").update(bytes).digest("hex");
          }
          const manifest = join(dir, "manifest.json"),
            bytes = Buffer.from(
              JSON.stringify({ files: pins, bootstrapFiles: pins }),
            );
          await writeFile(manifest, bytes);
          await writeFile(
            join(dir, "node.cmd"),
            `@echo off\r\necho {"status":"${success ? "OFFLINE_READY" : "NOT_VERIFIED"}"}\r\nexit /b ${success ? 0 : 17}\r\n`,
          );
          const env = { ...process.env, PATH: dir + ";" + process.env.PATH };
          for (const k of Object.keys(env))
            if (
              /^(AUTH_|GITHUB_|SENTINEL_|PG|DATABASE_)|^(APP_URL|DIRECT_URL|NODE_OPTIONS|WETSCAN_OWNER_AUTH_GRANT)$/.test(
                k,
              )
            )
              delete env[k as keyof typeof env];
          const result = await exec(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-File",
              join(scripts, "Invoke-S04OwnerReauth.ps1"),
              "-ManifestFile",
              manifest,
              "-ManifestSha256",
              createHash("sha256").update(bytes).digest("hex"),
            ],
            { env, windowsHide: true, timeout: 15000 },
          )
            .then((r) => ({ ...r, code: 0 }))
            .catch((e) => e);
          expect(result.code).toBe(success ? 0 : 1);
          expect(result.stdout).toContain(
            success ? "OFFLINE_READY" : "NOT_VERIFIED",
          );
          expect(result.stdout).not.toContain("Validated candidate");
        } finally {
          if (!basename(dir).startsWith("wetscan-reauth-offline-"))
            throw Error("fixture_cleanup_scope");
          await rm(dir, { recursive: true, force: true });
        }
      },
      20000,
    );
  },
);
