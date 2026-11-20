import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fixture, fileFixture, edit } from "./fixture";
import { sanitizeSource } from "../../../src/features/guard/g03/safety";
import { providerContext } from "../../../src/features/guard/g03/provider";
import { makePatch } from "../../../src/features/guard/g03/patch";
const body = "PRIVATE_BODY_NEVER_SHARE";
function material(eol = "\n") {
  const header = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  const lines = [
    "const pem = `" + header,
    ...Array.from({ length: 40 }, () => body),
    "-----END PRIVATE KEY-----`;",
    "export function route(input: string) { return eval(input); }",
  ];
  return { file: fileFixture(lines.join(eol) + eol), line: lines.length };
}
it.each(["\n", "\r\n"])(
  "preserves original source line identities while masking full multiline spans (%j)",
  (eol) => {
    const raw =
      material(eol).file.content +
      "const privateKey = `first-sensitive-line\nsecond-sensitive-line`;\n";
    const safe = sanitizeSource(raw);
    expect(safe.split("\n")).toHaveLength(raw.split("\n").length);
    expect(safe).not.toContain(body);
    expect(safe).not.toContain("first-sensitive-line");
    expect(safe).not.toContain("second-sensitive-line");
    expect(sanitizeSource(safe)).toBe(safe);
  },
);
it("masks key bodies whose BEGIN marker falls outside the selected 25-line neighborhood", async () => {
  const f = await fixture(),
    value = material();
  f.job.findings[0].location.line = value.line;
  const context = providerContext(f.job.findings[0], value.file);
  expect(context.firstLine).toBe(value.line - 11);
  expect(context.source).toContain("eval(input)");
  expect(context.source).not.toContain(body);
  expect(context.sourceRedacted).toBe(true);
});
it("rejects diff context that includes private-key tail lines even without a BEGIN marker", async () => {
  const f = await fixture(),
    value = material();
  f.job.findings[0].location.line = value.line;
  expect(() => makePatch(value.file, f.job.findings[0], edit)).toThrow(
    "sensitive_content",
  );
});
it("does not persist a model edit when its authorized neighborhood was redacted", async () => {
  const f = await fixture(),
    value = material();
  Object.assign(f.file, value.file);
  f.job.findings[0].location.line = value.line;
  const p = await f.proposed();
  expect(p).toMatchObject({ state: "failed", failure: "sensitive_content" });
  expect(p.patch).toBeUndefined();
  expect(JSON.stringify(p)).not.toContain(body);
  expect(f.provider.generate).toHaveBeenCalledTimes(1);
  expect(f.github.publish).not.toHaveBeenCalled();
});
