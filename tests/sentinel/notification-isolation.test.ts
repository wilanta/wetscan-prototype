import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Static guard for the S06 architecture decision: provider secrets live ONLY in the notifier lane. */
const root = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
const rel = (p: string) => relative(root, p).replace(/\\/g, "/");
const read = (p: string) => readFileSync(p, "utf8");
const sources = [...walk(join(root, "src")), ...walk(join(root, "worker"))];

describe("S06 credential isolation (source-level)", () => {
  it("the main Sentinel worker still strips TELEGRAM_/RESEND_/WHATSAPP_ and the notifier is a separate entry point", () => {
    const main = read(join(root, "worker/sentinel/main.ts"));
    expect(main).toMatch(/\^\(AUTH_\|GITHUB_\|TELEGRAM_\|RESEND_\|WHATSAPP_\|AWS_\)/);
    expect(main).toContain("delete process.env[key]");
    const notifier = read(join(root, "worker/notifier/main.ts"));
    // the sender strips what it must never carry …
    expect(notifier).toMatch(/AUTH_\|GITHUB_\|AWS_\|WHATSAPP_/);
    for (const p of ["APP", "WORKER", "MIGRATION", "TEST", "BOOTSTRAP"]) expect(notifier).toContain(`"${p}"`);
    // … and authenticates with its own DB role, not the worker's
    expect(notifier).toContain('"notifier"');
    expect(notifier).not.toContain('"worker"');
  });
  it("only worker/notifier/main.ts imports the provider adapters (no browser, API, worker, detection or incident code)", () => {
    const importers = sources.filter((f) => /notifications\/providers"/.test(read(f)) && !f.endsWith("providers.ts")).map(rel);
    expect(importers).toEqual(["worker/notifier/main.ts"]);
  });
  it("provider env names appear only in the notifier entry point and the provider module", () => {
    const allowed = new Set(["worker/notifier/main.ts", "src/features/sentinel/notifications/providers.ts", "worker/sentinel/main.ts"]);
    const offenders = sources.filter((f) => /process\.env\.(TELEGRAM_|RESEND_|WHATSAPP_)|"(TELEGRAM_BOT_TOKEN|RESEND_API_KEY)"/.test(read(f)) && !allowed.has(rel(f))).map(rel);
    expect(offenders).toEqual([]);
  });
  it("the producer (worker role) and the browser UI never import the sender store or provider code", () => {
    const sender = sources.filter((f) => /notifications\/sender-store"/.test(read(f))).map(rel).sort();
    expect(sender).toEqual(["worker/notifier/handler.ts", "worker/notifier/runtime.ts"]);
    const ui = sources.filter((f) => rel(f).startsWith("src/components") || rel(f).includes("/components/")).filter((f) => /providers"|sender-store"|node:fs/.test(read(f))).map(rel);
    expect(ui).toEqual([]);
  });
  it("the notifier role is provisioned separately, and 0006 never grants it app/worker/migration privileges", () => {
    const sql = read(join(root, "migrations/sentinel/0006_notifications.up.sql"));
    expect(sql).not.toMatch(/GRANT[^;]*(INSERT|DELETE)[^;]*sentinel\.notification_(channels|audit)[^;]*notifier/i);
    expect(sql).not.toMatch(/notifier[^;]*(CREATE ROLE|PASSWORD|SUPERUSER|BYPASSRLS)/i);
    expect(read(join(root, "infra/sentinel/provision-roles-s06.sql"))).toMatch(/CREATE ROLE wetscan_sentinel_notifier LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS/);
    expect(read(join(root, "infra/sentinel/provision-roles.sql"))).not.toContain("notifier"); // reviewed S01–S04 plan hash preserved
  });
  it("no source embeds a Telegram/Resend credential-shaped literal", () => {
    const hit = sources.filter((f) => /\b\d{8,12}:[A-Za-z0-9_-]{35}\b|\bre_[A-Za-z0-9]{20,}\b/.test(read(f))).map(rel);
    expect(hit).toEqual([]);
  });
});
