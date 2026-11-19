import { describe, expect, it } from "vitest";
import {
  destinationHash,
  maskDestination,
  messageText,
  emailSubject,
  meetsSeverity,
  quietUntil,
  redact,
  retryAt,
  validDestination,
  validTimezone,
} from "../../src/features/sentinel/notifications/model";
import { notificationCommand } from "../../src/features/sentinel/notifications/validation";
import { notificationActivation } from "../../src/features/sentinel/notifications/activation";
import type { DatabaseApproval } from "../../src/platform/config";

describe("destinations, severity and quiet hours", () => {
  it("validates per channel; WhatsApp is never valid until H06", () => {
    expect(validDestination("telegram", "123456789")).toBe(true);
    expect(validDestination("telegram", "-1001234567890")).toBe(true);
    for (const bad of [
      "abc",
      "@chan",
      "0123456",
      "12",
      "1 2 3 4 5",
      "123456789\n",
    ])
      expect(validDestination("telegram", bad)).toBe(false);
    expect(validDestination("email", "a.b+c@sub.example.com")).toBe(true);
    for (const bad of [
      "a@b",
      "a b@c.com",
      "a@b.com\r\nBcc: x@y.zz",
      "<script>@x.com",
      "a@@b.com",
    ])
      expect(validDestination("email", bad)).toBe(false);
    expect(validDestination("whatsapp", "+628123456789")).toBe(false);
  });
  it("masks destinations and hashes per channel", () => {
    expect(maskDestination("telegram", "123456789")).toBe("…6789");
    expect(maskDestination("email", "owner@example.com")).toBe(
      "o***@example.com",
    );
    expect(destinationHash("telegram", "1")).not.toBe(
      destinationHash("email", "1"),
    );
  });
  it("severity floor", () => {
    expect(meetsSeverity("high", "medium")).toBe(true);
    expect(meetsSeverity("low", "medium")).toBe(false);
  });
  it("timezone must be an explicit IANA name", () => {
    expect(validTimezone("Asia/Jakarta")).toBe(true);
    for (const bad of ["", "WIB", "Not/AZone", "UTC+7", "../etc"])
      expect(validTimezone(bad)).toBe(false);
  });
  it("quiet window [start,end) in the configured zone, including across midnight", () => {
    // 2026-11-19T16:30:00Z = 23:30 in Asia/Jakarta (UTC+7)
    const now = new Date("2026-11-19T16:30:00Z");
    const q = (start: number, end: number, timezone = "Asia/Jakarta") => ({
      enabled: true,
      timezone,
      startMinute: start,
      endMinute: end,
    });
    // 22:00–06:00 Jakarta ⇒ quiet; ends at 06:00 Jakarta = 23:00Z next day
    expect(quietUntil(now, q(22 * 60, 6 * 60))?.toISOString()).toBe(
      "2026-11-19T23:00:00.000Z",
    );
    // same wall clock window evaluated in UTC (16:30 UTC) is NOT inside 22:00–06:00
    expect(quietUntil(now, q(22 * 60, 6 * 60, "UTC"))).toBeNull();
    // daytime window 09:00–17:00 Jakarta does not include 23:30
    expect(quietUntil(now, q(9 * 60, 17 * 60))).toBeNull();
    // end boundary is exclusive: at exactly 06:00 local it is no longer quiet
    expect(
      quietUntil(new Date("2026-11-19T23:00:00Z"), q(22 * 60, 6 * 60)),
    ).toBeNull();
    expect(
      quietUntil(now, {
        enabled: false,
        timezone: null,
        startMinute: null,
        endMinute: null,
      }),
    ).toBeNull();
  });
  it("retry time is jittered, bounded, and never earlier than a capped provider retry-after", () => {
    const now = 1_000_000;
    const t = (n: number, ra?: number) => Date.parse(retryAt(n, ra, now)) - now;
    expect(t(1)).toBeGreaterThanOrEqual(1000);
    expect(t(1)).toBeLessThan(1300);
    expect(t(7)).toBeLessThanOrEqual(60250);
    expect(t(1, 30000)).toBeGreaterThanOrEqual(30000);
    expect(t(1, 24 * 3600 * 1000)).toBeLessThanOrEqual(15 * 60 * 1000 + 250); // capped
  });
});

describe("message construction and redaction (no secrets, bounded, no control characters)", () => {
  it("redacts bot tokens, bearer/API keys, long hex/base64 blobs and URL credentials", () => {
    const dirty = [
      "token 123456789:AAEhBP0av28zD1pV0T2tKq9xYz7mNn3Qw4kLs",
      "Bearer eyJhbGciOiJIUzI1NiJ9.abcdefghijk",
      "key re_ABCDEFGHIJKLMNOP1234",
      "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      "hash " + "a".repeat(64),
      "https://user:pass@host.example/x",
      "ctl\u0000\u0007chars",
    ].join("\n");
    const out = redact(dirty);
    for (const leaked of [
      "AAEhBP0av28",
      "eyJhbGci",
      "ABCDEFGHIJKLMNOP1234",
      "ghp_abcdef",
      "a".repeat(40),
      "user:pass",
      "\u0000",
      "\u0007",
    ])
      expect(out).not.toContain(leaked);
  });
  it("incident text is bounded, labelled, never claims a read receipt, and escapes nothing (plain text)", () => {
    const text = messageText("incident_opened", {
      severity: "high",
      title: "<b>x</b> ".repeat(100),
      incidentId: "i-1",
      origin: "controlled_test",
    });
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(text).toContain("HIGH incident opened");
    expect(text).toContain("Controlled test");
    expect(text).toContain("not a read receipt");
    expect(messageText("test", {})).toContain("This is not a real incident");
  });
  it("email subject cannot carry header injection", () => {
    expect(
      emailSubject("incident_opened", {
        severity: "low",
        title: "x\r\nBcc: evil@x.zz",
      }),
    ).not.toMatch(/[\r\n]/);
  });
});

describe("command and activation validation", () => {
  const key = "b".repeat(64);
  it("accepts well-formed commands and normalizes quiet hours to minutes", () => {
    expect(
      notificationCommand({
        action: "save_channel",
        channel: "telegram",
        destination: " 123456789 ",
        quiet: {
          enabled: true,
          timezone: "Asia/Jakarta",
          start: "22:00",
          end: "06:30",
        },
        minSeverity: "medium",
        triggers: ["incident_opened", "incident_opened"],
      }),
    ).toMatchObject({
      destination: "123456789",
      quiet: {
        enabled: true,
        timezone: "Asia/Jakarta",
        startMinute: 1320,
        endMinute: 390,
      },
      triggers: ["incident_opened"],
    });
    expect(
      notificationCommand({
        action: "test",
        channel: "email",
        idempotencyKey: key,
      }),
    ).toEqual({ action: "test", channel: "email", idempotencyKey: key });
  });
  it.each([
    [
      {
        action: "save_channel",
        channel: "telegram",
        quiet: { enabled: true, timezone: "UTC", start: "22:00", end: "22:00" },
      },
      "invalid_quiet_hours",
    ],
    [
      {
        action: "save_channel",
        channel: "telegram",
        quiet: { enabled: true, timezone: "UTC", start: "25:00", end: "01:00" },
      },
      "invalid_quiet_hours",
    ],
    [
      { action: "save_channel", channel: "telegram", throttlePerHour: 0 },
      "invalid_throttle",
    ],
    [
      { action: "save_channel", channel: "telegram", throttlePerHour: 61 },
      "invalid_throttle",
    ],
    [
      {
        action: "save_channel",
        channel: "telegram",
        triggers: ["alert_created"],
      },
      "invalid_trigger",
    ],
    [
      { action: "save_channel", channel: "telegram", minSeverity: "critical" },
      "invalid_severity",
    ],
    [
      { action: "save_channel", channel: "telegram", expectedRevision: 0 },
      "invalid_revision",
    ],
    [
      { action: "save_channel", channel: "telegram", enabled: "yes" },
      "invalid_payload",
    ],
    [{ action: "test", channel: "telegram" }, "invalid_idempotency_key"],
    [{ action: "unknown" }, "invalid_action"],
    ["string", "invalid_payload"],
  ])("rejects %j as %s", (input, code) => {
    expect(() => notificationCommand(input)).toThrow(
      expect.objectContaining({ code }),
    );
  });
  const approval = (n: unknown): DatabaseApproval =>
    ({
      schemaVersion: 1,
      status: "APPROVED",
      approvedBy: "o",
      approvedAt: "2026-11-19T00:00:00.000Z",
      target: { host: "127.0.0.1", port: 1, database: "x", marker: "m" },
      actions: ["runtime"],
      migrationPlanSha256: "a".repeat(64),
      notifications: n,
    }) as never;
  const block = {
    mode: "live",
    workspaceId: "w",
    projectId: "github-1",
    notBefore: "2026-11-19T01:00:00.000Z",
    channels: ["telegram"],
    approvedUse: "owner_controlled_notifications",
  };
  it("activation is fail-closed: needs the explicit flag AND a matching approval block; WhatsApp can never be approved", () => {
    expect(notificationActivation(approval(block), false)).toBeUndefined();
    expect(notificationActivation(approval(block), true)).toMatchObject({
      scope: { mode: "live", workspaceId: "w", projectId: "github-1" },
      channels: ["telegram"],
    });
    for (const bad of [
      undefined,
      {},
      { ...block, mode: "demo" },
      { ...block, channels: ["whatsapp"] },
      { ...block, channels: [] },
      { ...block, approvedUse: "x" },
      { ...block, projectId: "orderly-demo" },
      { ...block, notBefore: "2026-11-18T00:00:00.000Z" },
      { ...block, extra: 1 },
    ])
      expect(() => notificationActivation(approval(bad), true)).toThrow(
        expect.objectContaining({ code: "approval_required" }),
      );
  });
});
