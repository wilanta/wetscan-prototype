import { createHash } from "node:crypto";
import { redact, safePath } from "../security";
import { G03Error } from "./contracts";

export const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const gitBlob = (content: string) =>
  createHash("sha1")
    .update("blob " + Buffer.byteLength(content) + "\0")
    .update(content)
    .digest("hex");
export const isSha = (s: unknown, length = 40): s is string =>
  typeof s === "string" && new RegExp("^[a-f0-9]{" + length + "}$").test(s);
export function object(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== [...keys].sort().join()
  )
    throw new G03Error("invalid_input", 400);
  return value as Record<string, unknown>;
}
export function inputText(value: unknown, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new G03Error("invalid_input", 400);
  return value;
}
export function patchPath(value: string) {
  if (
    safePath(value) !== value ||
    /[\s\\]/.test(value) ||
    value
      .split("/")
      .some((p) => /^(?:\.|vendor$|dist$|build$|coverage$)/i.test(p)) ||
    (/(?:^|\/)(?:AGENTS\.md|SKILL\.md|package\.json|[^/]*lock[^/]*\.json)$/i.test(
      value,
    ) &&
      !/(?:^|\/)package-lock\.json$/.test(value)) ||
    !/\.(?:[cm]?[jt]sx?|json)$/.test(value)
  )
    throw new G03Error("unsafe_patch_path");
  return value;
}
/** More conservative than presentation redaction: source is data, never instructions. */
function sanitizedText(value: string, preserveLines: boolean) {
  const mask = (span: string, replacement: string) =>
    replacement + (preserveLines ? (span.match(/\r?\n/g) ?? []).join("") : "");
  return value
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
      (span) => mask(span, "[REDACTED PRIVATE KEY]"),
    )
    .replace(
      /(["']?\b(?:authorization|cookie|set-cookie|password|passwd|client[_-]?secret|secret|(?:access|refresh|id)[_-]?token|token|api[_-]?key|private[_-]?key)\b["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[^\s,;\r\n]+)/gi,
      (span, prefix: string) =>
        prefix + mask(span.slice(prefix.length), "[REDACTED]"),
    )
    .split(/(?<=\n)/)
    .map((line) => {
      const clean = redact(line)
        .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
        .replace(
          /\b(?:sk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,
          "[REDACTED]",
        )
        .replace(
          /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
          "[REDACTED EMAIL]",
        )
        .replace(
          /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"`]+/gi,
          "[REDACTED CONNECTION]",
        )
        .replace(
          /(['"])([A-Za-z0-9_+/=-]{24,})\1/g,
          (match, quote: string, body: string) =>
            /[a-z]/i.test(body) && /[0-9]/.test(body)
              ? quote + "[REDACTED OPAQUE VALUE]" + quote
              : match,
        );
      return preserveLines && line.endsWith("\n") && !clean.endsWith("\n")
        ? clean + (line.endsWith("\r\n") ? "\r\n" : "\n")
        : clean;
    })
    .join("");
}
export const sanitize = (value: string) => sanitizedText(value, false);
/** Redact the whole authorized file before selecting context, without shifting original line identities. */
export const sanitizeSource = (value: string) => sanitizedText(value, true);
export function assertPublic(value: string) {
  if (
    sanitize(value) !== value ||
    /-----BEGIN .*PRIVATE KEY|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
  )
    throw new G03Error("sensitive_content");
}
export function safeValue<T>(value: T): T {
  if (typeof value === "string") return sanitize(value) as T;
  if (Array.isArray(value)) return value.map(safeValue) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, safeValue(v)]),
    ) as T;
  return value;
}
