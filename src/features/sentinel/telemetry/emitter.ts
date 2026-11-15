/** Server-side Node/Next reference sender. No middleware is installed automatically. */
import { randomUUID } from "node:crypto";
import type { SentinelEventV1 } from "../types";
import {
  credentialRoute,
  parseBatch,
  TelemetryError,
  type Batch,
} from "./validation";

export interface EmitterOptions {
  enabled: boolean;
  ownedApplicationConfirmed: boolean;
  endpoint: string;
  credential: string;
}
export type Emission = Pick<
  SentinelEventV1,
  "kind" | "request" | "attributes" | "severityHint"
>;
export function referenceEmitter(
  options: EmitterOptions,
  transport: typeof fetch = fetch,
) {
  if (!options.enabled || !options.ownedApplicationConfirmed)
    throw new TelemetryError("emitter_opt_in_required");
  const endpoint = new URL(options.endpoint);
  if (
    endpoint.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(endpoint.hostname) ||
    endpoint.pathname !== "/api/sentinel/ingest" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new TelemetryError("local_endpoint_required");
  const route = credentialRoute(options.credential);
  return {
    prepare(events: Emission[], now = Date.now()): Batch {
      const at = new Date(now).toISOString();
      return parseBatch(
        {
          schemaVersion: 1,
          batchId: randomUUID(),
          sentAt: at,
          events: events.map((e) => ({
            ...e,
            schemaVersion: 1,
            eventId: randomUUID(),
            projectId: route.projectId,
            occurredAt: at,
          })),
        },
        route.projectId,
        now,
      );
    },
    async send(batch: Batch) {
      // Revalidate and redact again before any bytes leave the owned sender process.
      const safe = parseBatch(batch, route.projectId, Date.now());
      let response: Response;
      try {
        response = await transport(endpoint, {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.credential}`,
          },
          body: JSON.stringify(safe),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        throw new TelemetryError("emitter_connection_failed", 503);
      }
      if (![200, 202].includes(response.status))
        throw new TelemetryError("emitter_rejected", response.status);
      // Do not reflect an arbitrary receiver body into sender logs.
      return {
        status: response.status,
        batchId: safe.batchId,
        eventIds: safe.events.map((e) => e.eventId),
      };
    },
  };
}
