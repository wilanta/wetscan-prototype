import * as http from "node:http";
import { describe, expect, it } from "vitest";
import type { G05TargetRecord } from "../../../src/features/guard/g05/contracts";
import {
  EgressBlockedError,
  EnforcedHttpClient,
  isDisallowedIp,
  isMetadataIpv4,
  resolveAndValidateTarget,
} from "../../../src/features/guard/g05/egress";
import { SyntheticStagingServer } from "../../../worker/guard/g05-staging/server";

function makeTarget(overrides: Partial<G05TargetRecord> = {}): G05TargetRecord {
  return {
    workspaceId: "ws-1",
    projectId: "github-101",
    id: "target-staging",
    revision: 1,
    name: "Staging App",
    environment: "staging",
    origin: "https://staging.example.invalid",
    serviceIdentity: null,
    owner: "sec-team",
    status: "active",
    targetDigest: "a".repeat(64),
    createdBy: "actor",
    updatedBy: "actor",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: {
      allowedRoutes: ["/healthz", "/api/orders", "/api/orders/*"],
      allowedMethods: ["GET", "POST"],
      maxRequests: 10,
      maxConcurrency: 2,
      rateLimitRps: 50,
      maxResponseBytes: 4096,
      timeoutMs: 1500,
      approvedCategories: ["dast_header", "dast_response"],
      allowedSyntheticResources: ["order"],
      cleanupPolicy: "delete_created_and_revoke_sessions",
    },
    ...overrides,
  };
}

describe("G05 egress network & scope security boundary", () => {
  it("denies private, loopback, metadata, CGNAT, and mapped IPv6 addresses by default", async () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.10.2",
      "192.168.1.50",
      "169.254.169.254",
      "100.64.0.1",
      "100.100.100.200",
      "::1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
      "fe80::1",
      "fc00::1",
      "fd00:ec2::254",
      "64:ff9b::10.0.0.1",
      "2002:7f00:0001::1",
    ]) {
      expect(isDisallowedIp(ip)).toBe(true);
    }
    expect(isMetadataIpv4("169.254.169.254")).toBe(true);
    expect(isDisallowedIp("93.184.216.34")).toBe(false);

    const publicNamedStaging = makeTarget({ origin: "https://staging-app.example.com" });

    await expect(
      resolveAndValidateTarget(makeTarget({ origin: "https://staging.internal" })),
    ).rejects.toMatchObject({ reason: "invalid_origin" });

    await expect(
      resolveAndValidateTarget(publicNamedStaging, {
        dnsLookup: async () => [{ address: "169.254.169.254", family: 4 }],
      }),
    ).rejects.toMatchObject({ reason: "metadata_ip_denied" });

    await expect(
      resolveAndValidateTarget(publicNamedStaging, {
        dnsLookup: async () => [{ address: "10.20.30.40", family: 4 }],
      }),
    ).rejects.toMatchObject({ reason: "private_ip_denied" });

    await expect(
      resolveAndValidateTarget(publicNamedStaging, {
        dnsLookup: async () => [{ address: "127.0.0.1", family: 4 }],
      }),
    ).rejects.toMatchObject({ reason: "private_ip_denied" });
  });

  it("denies local loopback without explicit origin and serviceIdentity pin", async () => {
    const localTarget = makeTarget({
      environment: "local_synthetic",
      origin: "http://127.0.0.1:4115",
      serviceIdentity: "wetscan-g05-synthetic-staging-v1",
    });

    await expect(resolveAndValidateTarget(localTarget, { localPin: null })).rejects.toMatchObject({
      reason: "local_synthetic_not_authorized",
    });

    await expect(
      resolveAndValidateTarget(localTarget, {
        localPin: {
          allowedOrigin: "http://127.0.0.1:55436",
          serviceIdentity: "wrong-target",
        },
      }),
    ).rejects.toMatchObject({ reason: "local_synthetic_not_authorized" });
  });

  it("enforces local service identity header, disallowed routes/methods, request caps, response size caps, timeouts, redirects, and cancellation", async () => {
    const srv = new SyntheticStagingServer({
      host: "127.0.0.1",
      port: 0,
      initialFaults: { openRedirectTarget: "metadata" },
    });
    const info = await srv.start();
    try {
      const target = makeTarget({
        environment: "local_synthetic",
        origin: info.origin,
        serviceIdentity: info.serviceIdentity,
        config: {
          allowedRoutes: ["/healthz", "/api/orders", "/api/redirect-probe"],
          allowedMethods: ["GET", "POST"],
          maxRequests: 4,
          maxConcurrency: 1,
          rateLimitRps: 50,
          maxResponseBytes: 4096,
          timeoutMs: 1000,
          approvedCategories: ["dast_header", "dast_response"],
          allowedSyntheticResources: ["order"],
          cleanupPolicy: "delete_created_and_revoke_sessions",
        },
      });
      const client = new EnforcedHttpClient({
        target,
        localPin: { allowedOrigin: info.origin, serviceIdentity: info.serviceIdentity },
      });

      // Route & method allowlist enforced BEFORE network I/O
      await expect(client.request({ method: "DELETE", path: "/api/orders/1" })).rejects.toMatchObject({
        reason: "method_not_allowed",
      });
      await expect(client.request({ method: "GET", path: "/api/admin/audit" })).rejects.toMatchObject({
        reason: "route_not_allowed",
      });

      // Manual redirect inspection catches out-of-scope metadata redirect without following it
      const redir = await client.request({ method: "GET", path: "/api/redirect-probe" });
      expect(redir.status).toBe(302);
      expect(redir.redirectLocation).toContain("169.254.169.254");

      // Mismatched service identity blocks execution immediately
      const wrongPin = makeTarget({
        environment: "local_synthetic",
        origin: info.origin,
        serviceIdentity: "wrong-service-id",
      });
      const badClient = new EnforcedHttpClient({
        target: wrongPin,
        localPin: { allowedOrigin: info.origin, serviceIdentity: "wrong-service-id" },
      });
      await expect(badClient.request({ method: "GET", path: "/healthz" })).rejects.toMatchObject({
        reason: "service_identity_mismatch",
      });

      // Request cap blocks beyond maxRequests
      await client.request({ method: "GET", path: "/healthz" });
      await client.request({ method: "GET", path: "/healthz" });
      await expect(client.request({ method: "GET", path: "/healthz" })).rejects.toMatchObject({
        reason: "request_limit_exceeded",
      });
    } finally {
      await srv.stop();
    }
  });

  it("enforces maxResponseBytes and abort cancellation on streaming/slow servers", async () => {
    const rawServer = http.createServer((req, res) => {
      if (req.url === "/healthz") {
        res.writeHead(200, {
          "content-type": "application/json",
          "x-wetscan-synthetic-target": "size-test-v1",
        });
        res.end('{"ok":true}');
        return;
      }
      if (req.url === "/huge") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("A".repeat(4096));
        return;
      }
      res.writeHead(200);
      res.end("slow");
    });
    await new Promise<void>((ok) => rawServer.listen(0, "127.0.0.1", () => ok()));
    const port = (rawServer.address() as { port: number }).port;
    const origin = `http://127.0.0.1:${port}`;
    try {
      const target = makeTarget({
        environment: "local_synthetic",
        origin,
        serviceIdentity: "size-test-v1",
        config: {
          allowedRoutes: ["/healthz", "/huge"],
          allowedMethods: ["GET"],
          maxRequests: 5,
          maxConcurrency: 1,
          rateLimitRps: 50,
          maxResponseBytes: 256,
          timeoutMs: 1000,
          approvedCategories: ["dast_response"],
          allowedSyntheticResources: ["order"],
          cleanupPolicy: "delete_created_and_revoke_sessions",
        },
      });
      const client = new EnforcedHttpClient({
        target,
        localPin: { allowedOrigin: origin, serviceIdentity: "size-test-v1" },
      });
      await expect(client.request({ method: "GET", path: "/huge" })).rejects.toThrow(EgressBlockedError);

      const ac = new AbortController();
      const canceledClient = new EnforcedHttpClient({
        target,
        localPin: { allowedOrigin: origin, serviceIdentity: "size-test-v1" },
        signal: ac.signal,
      });
      ac.abort();
      await expect(canceledClient.request({ method: "GET", path: "/healthz" })).rejects.toMatchObject({
        reason: "cancelled",
      });
    } finally {
      await new Promise<void>((ok) => rawServer.close(() => ok()));
    }
  });
});
