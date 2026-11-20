import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  redactG05Text,
  redactHeaders,
  resolveVaultKey,
  sealCredential,
  unsealCredential,
  VaultError,
} from "../../../src/features/guard/g05/vault";

describe("G05 synthetic credential vault & secret redaction", () => {
  const ctx = {
    workspaceId: "github-user-1:ws-alpha",
    projectId: "github-101",
    targetId: "staging-primary",
    accountId: "acct-user-a",
  };
  const key = randomBytes(32);

  it("seals and unseals credentials bound to workspace/project/target/account AAD", () => {
    const sealed = sealCredential(
      { version: 1, secret: "syn_pass_12345" },
      ctx,
      key,
    );
    expect(sealed.ciphertext.startsWith("g05v1:")).toBe(true);
    expect(sealed.ciphertext).not.toContain("syn_pass_12345");
    expect(sealed.fingerprint).toMatch(/^[a-f0-9]{64}$/);

    const plain = unsealCredential(sealed.ciphertext, ctx, key);
    expect(plain.secret).toBe("syn_pass_12345");
  });

  it("fails closed when ciphertext is decrypted under wrong project, target, account, or key", () => {
    const sealed = sealCredential({ version: 1, secret: "syn_secret_xyz" }, ctx, key);
    expect(() =>
      unsealCredential(sealed.ciphertext, { ...ctx, projectId: "github-999" }, key),
    ).toThrow(VaultError);
    expect(() =>
      unsealCredential(sealed.ciphertext, { ...ctx, targetId: "staging-other" }, key),
    ).toThrow(VaultError);
    expect(() =>
      unsealCredential(sealed.ciphertext, { ...ctx, accountId: "acct-user-b" }, key),
    ).toThrow(VaultError);
    expect(() =>
      unsealCredential(sealed.ciphertext, ctx, randomBytes(32)),
    ).toThrow(VaultError);
    expect(() =>
      unsealCredential("invalid-envelope", ctx, key),
    ).toThrow(VaultError);
  });

  it("rejects missing or weak vault key configuration", () => {
    expect(() => resolveVaultKey({})).toThrow(VaultError);
    expect(() => resolveVaultKey({ GUARD_G05_VAULT_SECRET: "too-short" })).toThrow(VaultError);
    expect(() =>
      resolveVaultKey({ GUARD_G05_VAULT_KEY_FILE: "relative/vault.key" }),
    ).toThrow(VaultError);
  });

  it("redacts bearer tokens, cookies, signatures, and explicit synthetic secrets from evidence text & headers", () => {
    const secret = "syn_super_secret_token_987654";
    const raw = `Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def Cookie: sid=xyz123; password=${secret} token=${secret}`;
    const safe = redactG05Text(raw, [secret]);
    expect(safe).not.toContain(secret);
    expect(safe).not.toContain("eyJhbGciOi");
    expect(safe).not.toContain("xyz123");
    expect(safe).toContain("[REDACTED]");

    const headers = redactHeaders(
      {
        "set-cookie": ["wetscan_syn_sid=secretcookie; HttpOnly"],
        authorization: `Bearer ${secret}`,
        "x-wetscan-control": secret,
        "x-content-type-options": "nosniff",
      },
      [secret],
    );
    expect(headers["set-cookie"]).toBe("[REDACTED]");
    expect(headers["authorization"]).toBe("[REDACTED]");
    expect(headers["x-wetscan-control"]).toBe("[REDACTED_SECRET]");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });
});
