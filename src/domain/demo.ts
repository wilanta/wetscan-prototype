import { initialState } from "@/data/demo";
import type {
  DemoAction,
  DemoState,
  Incident,
  TimelineEvent,
  Trigger,
} from "./types";

function event(
  incident: Incident,
  type: string,
  explanation: string,
  evidenceId?: string,
): TimelineEvent {
  return {
    id: `${incident.id}-E${incident.timeline.length + 1}`,
    timestamp: `2026-11-13T07:32:${String(10 + incident.timeline.length).padStart(2, "0")}Z`,
    type,
    explanation,
    evidenceId,
  };
}
function notify(
  state: DemoState,
  incidentId: string,
  trigger: Trigger,
): DemoState {
  const logs = state.channels
    .filter((c) => c.enabled && c.triggers.includes(trigger))
    .filter(
      (c) =>
        !state.notifications.some(
          (n) =>
            n.incidentId === incidentId &&
            n.channel === c.channel &&
            n.trigger === trigger,
        ),
    )
    .map((c) => ({
      id: `${incidentId}-${trigger}-${c.channel}`,
      incidentId,
      channel: c.channel,
      trigger,
      status: "preview" as const,
      isSimulated: true as const,
      queuedAt: "2026-11-13T07:32:16Z",
      providerMessageId: null,
      attemptedAt: null,
      deliveredAt: null,
      failedAt: null,
      lastError: null,
    }));
  return { ...state, notifications: [...state.notifications, ...logs] };
}
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "reset":
      return initialState();
    case "detect": {
      if (action.source === "ghost" && !state.ghostEnabled) return state;
      const incident: Incident = {
        id: `INC-${1042 + state.incidents.length}`,
        title:
          action.source === "ghost"
            ? "A demo decoy was accessed"
            : "Repeated unauthorized order access",
        source: action.source,
        status: "open",
        responseState: "evaluating",
        timeline: [],
        archived: false,
      };
      if (action.source === "ghost") {
        incident.timeline.push(
          event(
            incident,
            "ghost.decoy_triggered",
            "GHOST-03 · local synthetic decoy interaction; no network request or production route.",
            "EV-GHOST",
          ),
        );
      }
      incident.timeline.push(
        event(
          incident,
          "attack_detected",
          action.source === "ghost"
            ? "GHOST-03 · simulated GET /.well-known/demo-decoy. A hit is not proof of compromise."
            : "Five synthetic requests for another customer’s order met rule DEMO-ACCESS-01.",
          "EV-DETECT",
        ),
      );
      incident.timeline.push(
        event(
          incident,
          "incident_created",
          "Incident opened; enabled detection notification previews created.",
        ),
      );
      return notify(
        { ...state, incidents: [...state.incidents, incident] },
        incident.id,
        "attack_detected",
      );
    }
    case "advance": {
      const incident = state.incidents.find((i) => i.id === action.id);
      if (!incident || incident.status === "closed") return state;
      const updated = { ...incident, timeline: [...incident.timeline] };
      let trigger: Trigger | undefined;
      if (incident.responseState === "evaluating") {
        updated.timeline.push(
          event(
            updated,
            "policy_evaluated",
            "DEMO-ACCESS-01 approved a scoped local rate limit: synthetic actor only; TTL 10 minutes.",
          ),
        );
        updated.timeline.push(
          event(
            updated,
            "mitigation_applied",
            "Demo enforcement adapter accepted the temporary restriction. Effectiveness is not yet verified.",
            "EV-ACTION",
          ),
        );
        updated.responseState = "applied";
        trigger = "mitigation_applied";
      } else if (incident.responseState === "applied") {
        updated.responseState = "verification_pending";
        updated.timeline.push(
          event(
            updated,
            "verification_pending",
            "Awaiting a separate synthetic follow-up request. No neutralization claim yet.",
          ),
        );
      } else if (
        incident.responseState === "verification_pending" &&
        action.outcome === "pass"
      ) {
        updated.responseState = "neutralization_verified";
        trigger = "neutralization_verified";
        updated.timeline.push(
          event(
            updated,
            "neutralization_verified",
            "EV-VERIFY: same synthetic actor received 429; control actor received 200. Verified only within this local demo scope.",
            "EV-VERIFY",
          ),
        );
      } else if (
        incident.responseState === "verification_pending" &&
        action.outcome === "fail"
      ) {
        updated.responseState = "failed";
        trigger = "response_failed";
        updated.timeline.push(
          event(
            updated,
            "response_failed",
            "Synthetic verification still received 200. Mitigation effectiveness failed; investigation remains open.",
            "EV-FAIL",
          ),
        );
      } else return state;
      let next = {
        ...state,
        incidents: state.incidents.map((i) =>
          i.id === updated.id ? updated : i,
        ),
      };
      if (trigger) next = notify(next, updated.id, trigger);
      return next;
    }
    case "rollback":
      return {
        ...state,
        incidents: state.incidents.map((i) =>
          i.id === action.id
            ? {
                ...i,
                responseState: "rolled_back",
                timeline: [
                  ...i.timeline,
                  event(
                    i,
                    "rollback",
                    "Demo restriction removed. Previous verification is historical; no current restriction is claimed.",
                  ),
                ],
              }
            : i,
        ),
      };
    case "close":
      return {
        ...state,
        incidents: state.incidents.map((i) =>
          i.id === action.id
            ? {
                ...i,
                status: "closed",
                timeline: [
                  ...i.timeline,
                  event(
                    i,
                    "incident_closed",
                    "User closed this demo investigation. Closure is not proof of security.",
                  ),
                ],
              }
            : i,
        ),
      };
    case "archive":
      return {
        ...state,
        rule: state.rule === "none" ? "draft" : state.rule,
        incidents: state.incidents.map((i) =>
          i.id === action.id ? { ...i, archived: true } : i,
        ),
      };
    case "channel":
      return {
        ...state,
        channels: state.channels.map((c) =>
          c.channel === action.config.channel ? action.config : c,
        ),
      };
    case "preview":
      return {
        ...state,
        notifications: [
          ...state.notifications,
          {
            id: `TEST-${state.notifications.length + 1}`,
            incidentId: "TEST",
            channel: action.channel,
            trigger: "test",
            status: "preview",
            isSimulated: true,
            queuedAt: "2026-11-13T07:32:16Z",
            providerMessageId: null,
            attemptedAt: null,
            deliveredAt: null,
            failedAt: null,
            lastError: null,
          },
        ],
      };
    case "scan":
      return { ...state, scans: state.scans + 1 };
    case "finding":
      return { ...state, findingStatus: action.status };
    case "integrity":
      return { ...state, integrity: action.result };
    case "ghost":
      return { ...state, ghostEnabled: action.enabled };
    case "rule":
      return action.status === "approved" && state.rule !== "draft"
        ? state
        : { ...state, rule: action.status };
    case "reevaluate":
      return { ...state, exposureReevaluated: true };
    case "staging":
      return { ...state, staging: action.staging };
    case "project":
      return {
        ...state,
        projectName: action.name,
        provider: action.provider,
        branch: action.branch,
      };
    case "preferences":
      return {
        ...state,
        quietHours: action.quietHours,
        retention: action.retention,
      };
  }
}
