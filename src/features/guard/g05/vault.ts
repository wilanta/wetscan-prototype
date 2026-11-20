import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { redact } from "../security";

export interface VaultCredentialPayload {
  version: 1;
  secret: string;
  headerName?: string;
}

export class VaultError extends Error {
  constructor(
    public readonly code:
      | "vault_not_configured"
      | "vault_invalid_key"
      | "vault_corrupt_envelope",
    message: string,
  ) {
    super(message);
  }
}

export function resolveVaultKey(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Buffer {
  const keyFile = env.GUARD_G05_VAULT_KEY_FILE;
  let raw = "";
  if (keyFile) {
    if (!isAbsolute(keyFile))
      throw new VaultError("vault_invalid_key", "Vault key file must be an absolute path.");
    try {
      raw = readFileSync(keyFile, "utf8").trim();
    } catch {
      throw new VaultError("vault_not_configured", "Vault key file is unreadable.");
    }
  } else if (env.GUARD_G05_VAULT_SECRET) {
    raw = env.GUARD_G05_VAULT_SECRET.trim();
  } else {
    throw new VaultError("vault_not_configured", "G05 credential vault is not configured.");
  }
  if (raw.length < 32 || /[\r\n\0]/.test(raw))
    throw new VaultError("vault_invalid_key", "Vault key does not meet minimum length.");
  return createHash("sha256").update("wetscan-g05-vault-v1:").update(raw).digest();
}

function aadFor(context: {
  workspaceId: string;
  projectId: string;
  targetId: string;
  accountId: string;
}): Buffer {
  return Buffer.from(
    [context.workspaceId, context.projectId, context.targetId, context.accountId].join("|"),
    "utf8",
  );
}

/** Seals synthetic test-account credentials with AES-256-GCM bound to workspace/project/target/account AAD. */
export function sealCredential(
  payload: VaultCredentialPayload,
  context: {
    workspaceId: string;
    projectId: string;
    targetId: string;
    accountId: string;
  },
  vaultKey: Buffer,
): { ciphertext: string; fingerprint: string } {
  if (vaultKey.byteLength !== 32)
    throw new VaultError("vault_invalid_key", "Expected 32-byte AES-256 key.");
  if (!payload.secret || payload.secret.length > 2048 || /[\r\n\0]/.test(payload.secret))
    throw new Error("Invalid synthetic credential payload.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey, iv);
  cipher.setAAD(aadFor(context));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const envelope = Buffer.concat([iv, tag, encrypted]).toString("base64url");
  const fingerprint = createHash("sha256")
    .update(context.workspaceId + "\0" + context.projectId + "\0" + context.targetId + "\0" + payload.secret)
    .digest("hex");
  return {
    ciphertext: `g05v1:${envelope}`,
    fingerprint,
  };
}

export function unsealCredential(
  ciphertext: string,
  context: {
    workspaceId: string;
    projectId: string;
    targetId: string;
    accountId: string;
  },
  vaultKey: Buffer,
): VaultCredentialPayload {
  if (!ciphertext.startsWith("g05v1:") || vaultKey.byteLength !== 32)
    throw new VaultError("vault_corrupt_envelope", "Invalid encrypted credential format.");
  try {
    const raw = Buffer.from(ciphertext.slice("g05v1:".length), "base64url");
    if (raw.byteLength < 29)
      throw new VaultError("vault_corrupt_envelope", "Truncated encrypted credential.");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", vaultKey, iv);
    decipher.setAAD(aadFor(context));
    decipher.setAuthTag(tag);
    const parsed = JSON.parse(
      Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"),
    ) as VaultCredentialPayload;
    if (parsed?.version !== 1 || typeof parsed.secret !== "string" || !parsed.secret)
      throw new VaultError("vault_corrupt_envelope", "Invalid decrypted credential structure.");
    return parsed;
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError("vault_corrupt_envelope", "Credential decryption failed.");
  }
}

/** Strips bearer tokens, cookies, set-cookie, passwords, private keys, and any runtime synthetic secrets. */
export function redactG05Text(input: string, extraSecrets: readonly string[] = []): string {
  let out = redact(input)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, "Bearer [REDACTED]")
    .replace(/\b(?:cookie|set-cookie)\s*:\s*[^\r\n]+/gi, "Cookie: [REDACTED]")
    .replace(
      /("(?:password|secret|token|accessToken|refreshToken|sessionId|cookie|authorization|x-api-key|apiKey)"\s*:\s*)"[^"]*"/gi,
      '$1"[REDACTED]"',
    )
    .replace(/\bwetscan_syn_[A-Za-z0-9._-]+\b/g, "[REDACTED_SYNTHETIC_SECRET]");
  for (const secret of extraSecrets) {
    if (secret && secret.length >= 6) {
      out = out.split(secret).join("[REDACTED_SECRET]");
    }
  }
  return out.slice(0, 3500);
}

export function redactHeaders(
  headers: Record<string, string | string[] | undefined>,
  extraSecrets: readonly string[] = [],
): Record<string, string> {
  const sensitiveKeys = new Set([
    "authorization",
    "proxy-authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    "x-csrf-token",
  ]);
  const out: Record<string, string> = {};
  for (const [rawKey, rawVal] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    if (Object.keys(out).length >= 30) break;
    const val = Array.isArray(rawVal) ? rawVal.join("; ") : (rawVal ?? "");
    out[key] = sensitiveKeys.has(key)
      ? "[REDACTED]"
      : redactG05Text(val, extraSecrets).slice(0, 300);
  }
  return out;
}

/** Recursively redacts strings inside structured JSON objects/arrays without corrupting JSON syntax. */
export function redactG05JsonValue<T>(
  value: T,
  extraSecrets: readonly string[] = [],
  depth = 0,
): T {
  if (depth > 20 || value === null || value === undefined) return value;
  if (typeof value === "string") return redactG05Text(value, extraSecrets) as T;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactG05JsonValue(item, extraSecrets, depth + 1)) as unknown as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      if (/^(?:password|secret|accessToken|refreshToken|credentialCiphertext)$/i.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactG05JsonValue(v, extraSecrets, depth + 1);
      }
    }
    return out as T;
  }
  return value;
}
