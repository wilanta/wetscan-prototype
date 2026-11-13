import { edges, findings, nodes } from "@/data/demo";
export interface RepositoryAdapter {
  mode: "demo" | "live";
  listRepositories(
    provider: "github" | "gitlab",
  ): Promise<{ name: string; branch: string }[]>;
}
export interface ScanAdapter {
  mode: "demo" | "live";
  run(): Promise<{ status: "simulated"; findingIds: string[] }>;
}
export interface TelemetryAdapter {
  mode: "demo" | "live";
  connected: boolean;
  describe(): string;
}
export interface ResponseAdapter {
  mode: "demo" | "live";
  enforce(scope: string): Promise<{ accepted: boolean; evidence: string }>;
  verify(
    scope: string,
  ): Promise<{ blocked: boolean; controlAllowed: boolean; evidence: string }>;
}
export interface NotificationAdapter {
  mode: "demo" | "live";
  preview(
    message: string,
  ): Promise<{ status: "preview"; message: string; providerMessageId: null }>;
}
export interface AIProvider {
  configured: boolean;
  explain(context: {
    findingId: string;
    redactedEvidence: string;
  }): Promise<string>;
}
export const repositories: RepositoryAdapter = {
  mode: "demo",
  async listRepositories() {
    return [
      { name: "northstar-studio/orderly-demo", branch: "main" },
      { name: "northstar-studio/storefront-sample", branch: "develop" },
    ];
  },
};
export const scans: ScanAdapter = {
  mode: "demo",
  async run() {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return { status: "simulated", findingIds: findings.map((f) => f.id) };
  },
};
export const telemetry: TelemetryAdapter = {
  mode: "demo",
  connected: false,
  describe: () =>
    "Production telemetry is not connected. Only local simulations create events.",
};
export const responses: ResponseAdapter = {
  mode: "demo",
  async enforce(scope) {
    return {
      accepted: true,
      evidence: `Synthetic restriction accepted for ${scope}; no network operation.`,
    };
  },
  async verify(scope) {
    return {
      blocked: true,
      controlAllowed: true,
      evidence: `Synthetic 429 / control 200 for ${scope}.`,
    };
  },
};
export const notifications: NotificationAdapter = {
  mode: "demo",
  async preview(message) {
    return { status: "preview", message, providerMessageId: null };
  },
};
export const ai: AIProvider = {
  configured: false,
  async explain() {
    throw new Error(
      "AI is not configured. Select a provider server-side before use.",
    );
  },
};
export const application = {
  mode: "demo" as const,
  async map() {
    return { nodes, edges };
  },
};
