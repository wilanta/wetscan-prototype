import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const ai = vi.hoisted(() => ({ explain: vi.fn() }));
vi.mock("../../../src/features/guard/live/remediation-provider", () => ({
  remediationProvider: () => ({ configured: true, explain: ai.explain }),
  providerMetadata: () => ({
    enabled: true,
    modelConfigured: true,
    credentialReferencePresent: true,
    dataPolicyApproved: true,
  }),
}));
import { analysisFixture } from "./analysis-fixture";
import {
  GuardLiveService,
  defaultReadiness,
} from "../../../src/features/guard/live/service";
import type { GuardStorage } from "../../../src/features/guard/live/model";
import { authority } from "./operational-fixture";
async function serviceFixture() {
  const f = await analysisFixture();
  const storage = {
    get: async () => ({
      job: f.get().current,
      revision: f.get().revision,
      coverage: null,
    }),
  } as unknown as GuardStorage;
  return {
    ...f,
    service: new GuardLiveService(
      storage,
      { ...defaultReadiness, database: "approved", schema: "verified" },
      undefined,
      f.store,
    ),
    authority: { ...authority, grant: f.grant },
  };
}
it("AI-off actual service persists fallback without credential/provider access", async () => {
  ai.explain.mockClear();
  const f = await serviceFixture();
  await f.service.proposeRemediation(
    f.authority,
    f.job.id,
    {
      revision: 1,
      findingId: f.job.findings[0].id,
      requestKey: "g03-service-off01",
      aiConsent: false,
    },
    new AbortController().signal,
    async () => f.authority,
  );
  expect(ai.explain).not.toHaveBeenCalled();
  expect(f.get().current.guardRemediation![0]).toMatchObject({
    state: "completed",
    source: "deterministic",
  });
});
it("revocation after provider response preserves consumed reservation and forbids final success", async () => {
  const f = await serviceFixture();
  ai.explain.mockResolvedValue({
    advice: {
      explanation: "unit",
      recommendation: "unit",
      risks: "unit",
      verification: "unit",
    },
    provenance: { name: "unit", model: "unit", promptVersion: "unit" },
  });
  await expect(
    f.service.proposeRemediation(
      f.authority,
      f.job.id,
      {
        revision: 1,
        findingId: f.job.findings[0].id,
        requestKey: "g03-service-revoked",
        aiConsent: true,
      },
      new AbortController().signal,
      async () => {
        throw Error("revoked");
      },
    ),
  ).rejects.toThrow("revoked");
  expect(f.get().current.guardRemediation![0].state).toBe("reserved");
});
it("provider failure is recorded safely and not retried", async () => {
  ai.explain.mockClear().mockRejectedValue(Error("SECRET_PROVIDER_BODY"));
  const f = await serviceFixture();
  await f.service.proposeRemediation(
    f.authority,
    f.job.id,
    {
      revision: 1,
      findingId: f.job.findings[0].id,
      requestKey: "g03-service-fail01",
      aiConsent: true,
    },
    new AbortController().signal,
    async () => f.authority,
  );
  expect(ai.explain).toHaveBeenCalledTimes(1);
  expect(f.get().current.guardRemediation![0]).toMatchObject({
    state: "failed",
    failure: "provider_unavailable",
  });
  expect(JSON.stringify(f.get().current)).not.toContain("SECRET_PROVIDER_BODY");
});
