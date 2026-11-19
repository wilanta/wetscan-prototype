import { it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const files = vi.hoisted(() => ({
  read: vi.fn(),
  stat: vi.fn(),
  acl: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  readFile: files.read,
  lstat: files.stat,
}));
vi.mock("../../../src/features/guard/live/product-preflight", () => ({
  assertPrivateRuntimeRoot: files.acl,
}));
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  remediationProvider,
  providerMetadata,
} from "../../../src/features/guard/live/remediation-provider";
const env = {
  GUARD_AI_ENABLED: "1",
  GUARD_AI_MODEL: "unit-pinned-model",
  GUARD_AI_API_KEY_FILE: join(tmpdir(), "unit-provider", "reference.txt"),
  GUARD_AI_DATA_POLICY_APPROVED: "1",
};
const input = {
  engine: "sast",
  ruleId: "unit-rule",
  severity: "high",
  confidence: "medium",
};
const advice = {
  explanation: "Rule explanation",
  recommendation: "Review the minimal change",
  risks: "Advice is untrusted",
  verification: "Run a real targeted scanner",
};
function response(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      status: "completed",
      model: env.GUARD_AI_MODEL,
      usage: { output_tokens: 100 },
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: JSON.stringify(advice) }],
        },
      ],
      ...overrides,
    }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  files.read.mockResolvedValue("SYNTHETIC_REFERENCE_ONLY_000000000");
  files.stat.mockResolvedValue({
    isFile: () => true,
    isSymbolicLink: () => false,
    size: 36,
  });
  files.acl.mockResolvedValue(undefined);
});
it("metadata never opens a credential or calls a provider", () => {
  expect(providerMetadata(env)).toEqual({
    enabled: true,
    modelConfigured: true,
    credentialReferencePresent: true,
    dataPolicyApproved: true,
  });
  expect(files.read).not.toHaveBeenCalled();
});
it("disabled or privacy-unapproved provider refuses before credential read/transport", async () => {
  const transport = vi.fn();
  await expect(
    remediationProvider(
      { ...env, GUARD_AI_DATA_POLICY_APPROVED: "0" },
      transport,
    ).explain(input, new AbortController().signal),
  ).rejects.toThrow("not_configured");
  expect(files.read).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
});
it("real transport implementation is bounded, fixed-origin, stateless and has no tools/source context (HTTP double)", async () => {
  const transport = vi.fn().mockResolvedValue(response());
  const r = await remediationProvider(env, transport).explain(
    input,
    new AbortController().signal,
  );
  expect(r.advice).toEqual(advice);
  expect(r.provenance.model).toBe(env.GUARD_AI_MODEL);
  const [url, options] = transport.mock.calls[0];
  expect(url).toBe("https://api.openai.com/v1/responses");
  const body = JSON.parse(options.body);
  expect(body).toMatchObject({
    store: false,
    stream: false,
    tools: [],
    max_output_tokens: 1024,
  });
  expect(JSON.parse(body.input)).toEqual(input);
  expect(options.redirect).toBe("error");
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(transport).toHaveBeenCalledTimes(1);
});
it.each([
  "model",
  "partial",
  "tools",
  "schema",
  "budget",
  "http",
  "oversize",
  "symlink",
])("provider %s fails closed without retry", async (mode) => {
  if (mode === "symlink")
    files.stat.mockResolvedValue({
      isFile: () => true,
      isSymbolicLink: () => true,
      size: 36,
    });
  let r = response();
  if (mode === "model") r = response({ model: "other-model" });
  if (mode === "partial") r = response({ status: "incomplete" });
  if (mode === "tools")
    r = response({ output: [{ type: "function_call", name: "execute" }] });
  if (mode === "schema")
    r = response({
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: '{"execute":"bad"}' }],
        },
      ],
    });
  if (mode === "budget") r = response({ usage: { output_tokens: 2000 } });
  if (mode === "http")
    r = new Response("SECRET_BODY_DO_NOT_REPORT", { status: 500 });
  if (mode === "oversize") r = new Response("x".repeat(24001));
  const transport = vi.fn().mockResolvedValue(r);
  await expect(
    remediationProvider(env, transport).explain(
      input,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(transport.mock.calls.length).toBeLessThanOrEqual(1);
});
