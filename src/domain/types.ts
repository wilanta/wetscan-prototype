export type EvidenceOrigin = "verified" | "inferred" | "user_added";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Channel = "telegram" | "email" | "whatsapp";
export type Trigger =
  | "attack_detected"
  | "mitigation_applied"
  | "neutralization_verified"
  | "response_failed"
  | "new_exposure";
export type ResponseState =
  | "evaluating"
  | "applied"
  | "verification_pending"
  | "neutralization_verified"
  | "failed"
  | "rolled_back";
export interface AppNode {
  id: string;
  label: string;
  kind: string;
  tech: string;
  description: string;
  evidenceOrigin: EvidenceOrigin;
  findingIds: string[];
  x: number;
  y: number;
}
export interface Finding {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  nodeId: string;
  engine: string;
  file: string;
  impact: string;
  evidence: string;
}
export interface TimelineEvent {
  id: string;
  timestamp: string;
  type: string;
  explanation: string;
  evidenceId?: string;
}
export interface Incident {
  id: string;
  title: string;
  source: "api" | "ghost";
  status: "open" | "closed";
  responseState: ResponseState;
  timeline: TimelineEvent[];
  archived: boolean;
}
export interface ChannelConfig {
  channel: Channel;
  enabled: boolean;
  triggers: Trigger[];
  destination: string;
}
export interface DeliveryLog {
  id: string;
  incidentId: string;
  channel: Channel;
  trigger: Trigger | "test";
  status: "preview";
  isSimulated: true;
  queuedAt: string;
  providerMessageId: null;
  attemptedAt: null;
  deliveredAt: null;
  failedAt: null;
  lastError: null;
}
export interface DemoState {
  version: 1;
  projectName: string;
  provider: "github" | "gitlab";
  branch: string;
  incidents: Incident[];
  notifications: DeliveryLog[];
  channels: ChannelConfig[];
  findingStatus:
    | "potential"
    | "verified"
    | "fixed_pending_retest"
    | "verified_fixed"
    | "false_positive";
  scans: number;
  integrity: "not_run" | "failed" | "passed";
  ghostEnabled: boolean;
  rule: "none" | "draft" | "approved";
  exposureReevaluated: boolean;
  staging: { url: string; authorized: boolean; paths: string; rate: number };
  quietHours: boolean;
  retention: string;
}
export type DemoAction =
  | { type: "reset" }
  | { type: "detect"; source: "api" | "ghost" }
  | { type: "advance"; id: string; outcome?: "pass" | "fail" | "pending" }
  | { type: "rollback" | "close" | "archive"; id: string }
  | { type: "channel"; config: ChannelConfig }
  | { type: "preview"; channel: Channel }
  | { type: "scan" }
  | { type: "finding"; status: DemoState["findingStatus"] }
  | { type: "integrity"; result: DemoState["integrity"] }
  | { type: "ghost"; enabled: boolean }
  | { type: "rule"; status: DemoState["rule"] }
  | { type: "reevaluate" }
  | { type: "staging"; staging: DemoState["staging"] }
  | {
      type: "project";
      name: string;
      provider: DemoState["provider"];
      branch: string;
    }
  | { type: "preferences"; quietHours: boolean; retention: string };
