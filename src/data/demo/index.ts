import type { AppNode, DemoState, Finding } from "@/domain/types";
export const PROJECT = "/app/projects/orderly-demo";
export const nodes: AppNode[] = [
  {
    id: "web",
    label: "Web application",
    kind: "frontend",
    tech: "Next.js · TypeScript",
    description:
      "The storefront where customers browse products and manage their orders.",
    evidenceOrigin: "verified",
    findingIds: ["FIND-103"],
    x: 40,
    y: 180,
  },
  {
    id: "orders-api",
    label: "Orders API",
    kind: "api",
    tech: "REST API · 6 endpoints",
    description:
      "Handles order details and updates. Every request should check who owns the order.",
    evidenceOrigin: "verified",
    findingIds: ["FIND-102"],
    x: 350,
    y: 180,
  },
  {
    id: "database",
    label: "Orders database",
    kind: "database",
    tech: "PostgreSQL · 4 tables",
    description:
      "Stores customer profiles, order items, and order status. Contains synthetic demo records only.",
    evidenceOrigin: "verified",
    findingIds: [],
    x: 660,
    y: 180,
  },
  {
    id: "auth",
    label: "Authentication",
    kind: "auth",
    tech: "Clerk · Session tokens",
    description:
      "Establishes identity. A valid session alone does not prove access to another customer’s order.",
    evidenceOrigin: "verified",
    findingIds: [],
    x: 350,
    y: -10,
  },
  {
    id: "github",
    label: "Code repository",
    kind: "repository",
    tech: "GitHub · main",
    description:
      "Fictional northstar-studio/orderly-demo repository. No OAuth authorization or repository access.",
    evidenceOrigin: "verified",
    findingIds: [],
    x: 40,
    y: 410,
  },
  {
    id: "release",
    label: "Release pipeline",
    kind: "release",
    tech: "CI · Build & deploy",
    description:
      "An inferred deployment relationship in the sample architecture, not an enforced release gate.",
    evidenceOrigin: "inferred",
    findingIds: [],
    x: 350,
    y: 410,
  },
  {
    id: "hosting",
    label: "Application hosting",
    kind: "hosting",
    tech: "Staging environment",
    description:
      "A user-added staging boundary. No actual cloud account or deployment is connected.",
    evidenceOrigin: "user_added",
    findingIds: ["FIND-104"],
    x: 660,
    y: 410,
  },
  {
    id: "telemetry",
    label: "Telemetry collector",
    kind: "telemetry",
    tech: "Demo adapter · Inactive",
    description:
      "Only explicit local simulations create events. Production telemetry is not connected.",
    evidenceOrigin: "inferred",
    findingIds: [],
    x: 660,
    y: -10,
  },
];
export const edges = [
  {
    id: "request",
    source: "web",
    target: "orders-api",
    label: "HTTPS request",
    evidenceOrigin: "verified",
  },
  {
    id: "read",
    source: "orders-api",
    target: "database",
    label: "Read / write",
    evidenceOrigin: "verified",
  },
  {
    id: "identity",
    source: "auth",
    target: "orders-api",
    label: "Session check",
    evidenceOrigin: "verified",
  },
  {
    id: "build",
    source: "github",
    target: "release",
    label: "Build trigger",
    evidenceOrigin: "inferred",
  },
  {
    id: "deploy",
    source: "release",
    target: "hosting",
    label: "Deploy",
    evidenceOrigin: "inferred",
  },
  {
    id: "observe",
    source: "orders-api",
    target: "telemetry",
    label: "Events · inferred",
    evidenceOrigin: "inferred",
  },
];
export const findings: Finding[] = [
  {
    id: "FIND-102",
    title: "Customers may see someone else’s order",
    category: "Access control · BOLA / IDOR",
    severity: "high",
    nodeId: "orders-api",
    engine: "Demo API test runner · v1",
    file: "app/api/orders/[id]/route.ts:18",
    impact:
      "A signed-in customer could read another customer’s delivery details by changing the order ID in a request.",
    evidence:
      "Customer A requests Customer B’s synthetic order ord_demo_b. Expected: 403. Fixture response: 200 with owner customer_b.",
  },
  {
    id: "FIND-103",
    title: "A dependency needs a closer look",
    category: "Dependencies · Advisory mapping",
    severity: "medium",
    nodeId: "web",
    engine: "Demo inventory mapping · v1",
    file: "package-lock.json (fictional inventory)",
    impact:
      "An advisory potentially matches the demo dependency inventory. Reachability and exploitability have not been verified.",
    evidence:
      "ADV-009 → demo-parser@1.4.0 → orderly-demo. Fictional advisory; not a real CVE or observed attack.",
  },
  {
    id: "FIND-104",
    title: "A security header is missing",
    category: "Configuration · Response headers",
    severity: "low",
    nodeId: "hosting",
    engine: "Demo configuration check · v1",
    file: "next.config.ts (sample)",
    impact:
      "An explicit content policy could reduce the impact of unexpected scripts. This fixture is a configuration suggestion.",
    evidence:
      "Sample response has no Content-Security-Policy header. No request was made to a real deployment.",
  },
];
export function initialState(): DemoState {
  return {
    version: 1,
    projectName: "Orderly Demo",
    provider: "github",
    branch: "main",
    incidents: [],
    notifications: [],
    channels: (["telegram", "email", "whatsapp"] as const).map((channel) => ({
      channel,
      enabled: channel !== "whatsapp",
      triggers: [
        "attack_detected",
        "neutralization_verified",
        "response_failed",
      ],
      destination:
        channel === "email"
          ? "team@example.test"
          : channel === "telegram"
            ? "Demo team channel"
            : "",
    })),
    findingStatus: "potential",
    scans: 1,
    integrity: "not_run",
    ghostEnabled: false,
    rule: "none",
    exposureReevaluated: false,
    staging: { url: "", authorized: false, paths: "/api/orders/*", rate: 2 },
    quietHours: false,
    retention: "30",
  };
}
