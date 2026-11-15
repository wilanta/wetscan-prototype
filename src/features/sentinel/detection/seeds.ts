import type { RuleDefinition } from "./model";

/** Explicit POST seed only: idempotent DRAFTs, never migration/startup enrollment. */
export const seedRules: { key: string; definition: RuleDefinition }[] = [
  {
    key: "auth-failures-v1",
    definition: {
      schemaVersion: 1,
      name: "Repeated authentication failures",
      description:
        "Five failures per actor in a five-minute UTC bucket. Unsupported until a reviewed producer persists privacy-preserving actor identity.",
      category: "authentication",
      severity: "medium",
      confidence: 60,
      eventKinds: ["auth.failed"],
      conditions: [],
      correlation: "actor_hash",
      windowSeconds: 300,
      threshold: 5,
      cooldownSeconds: 300,
      suppressionWindows: [],
    },
  },
  {
    key: "suspicious-path-v1",
    definition: {
      schemaVersion: 1,
      name: "Suspicious HTTP path marker",
      description:
        "A sender-marked suspicious path; does not establish a successful intrusion.",
      category: "http",
      severity: "medium",
      confidence: 50,
      eventKinds: ["http.suspicious_path"],
      conditions: [
        { field: "attributes.reasonCode", op: "eq", value: "suspicious_path" },
      ],
      correlation: "source",
      windowSeconds: 60,
      threshold: 1,
      cooldownSeconds: 60,
      suppressionWindows: [],
    },
  },
  {
    key: "controlled-decoy-v1",
    definition: {
      schemaVersion: 1,
      name: "Accepted decoy trigger",
      description:
        "An accepted wire event. Controlled-test provenance is preserved; this is not proof of an installed decoy or attack.",
      category: "decoy",
      severity: "high",
      confidence: 70,
      eventKinds: ["ghost.decoy_triggered"],
      conditions: [],
      correlation: "source",
      windowSeconds: 60,
      threshold: 1,
      cooldownSeconds: 60,
      suppressionWindows: [],
    },
  },
  {
    key: "http-errors-v1",
    definition: {
      schemaVersion: 1,
      name: "Repeated HTTP error responses",
      description:
        "Five normalized HTTP status codes of 400 or higher per source in five minutes; an operational signal, not actor attribution.",
      category: "http",
      severity: "low",
      confidence: 40,
      eventKinds: ["http.request"],
      conditions: [{ field: "request.statusCode", op: "gte", value: 400 }],
      correlation: "source",
      windowSeconds: 300,
      threshold: 5,
      cooldownSeconds: 300,
      suppressionWindows: [],
    },
  },
];
