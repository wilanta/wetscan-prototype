import { TelemetryError, object } from "../telemetry/validation";
import { normId } from "./normalize";
import {
  ecosystems,
  providers,
  severities,
  type Provider,
  type Severity,
} from "./model";

export type ExternalCommand =
  { action: "sync"; providers: Provider[] } | { action: "refresh_inventory" };
/** Strict allow-list: scope, mode, actor, URLs and credentials are never accepted from the client. */
export function externalCommand(input: unknown): ExternalCommand {
  const c = object(input, ["action", "providers"]);
  if (c.action === "refresh_inventory") {
    if (c.providers !== undefined) throw new TelemetryError("invalid_payload");
    return { action: "refresh_inventory" };
  }
  if (c.action !== "sync") throw new TelemetryError("invalid_action");
  const list = c.providers === undefined ? [...providers] : c.providers;
  if (!Array.isArray(list) || !list.length || list.length > providers.length)
    throw new TelemetryError("invalid_providers");
  const out = [...new Set(list)];
  if (out.some((p) => !providers.includes(p as Provider)))
    throw new TelemetryError("invalid_providers");
  return { action: "sync", providers: out as Provider[] };
}
export interface ExternalQuery {
  view: "overview" | "advisories" | "exposures";
  advisoryId?: string;
  q?: string;
  provider?: Provider;
  severity?: Severity;
  kev?: boolean;
  ecosystem?: string;
  packageName?: string;
  status?: "active" | "withdrawn" | "removed_from_source";
  offset: number;
}
const keys = [
  "view",
  "advisoryId",
  "q",
  "provider",
  "severity",
  "kev",
  "ecosystem",
  "package",
  "status",
  "offset",
];
export function externalQuery(params: URLSearchParams): ExternalQuery {
  for (const k of params.keys())
    if (!keys.includes(k)) throw new TelemetryError("invalid_query");
  const get = (k: string) => {
    const all = params.getAll(k);
    if (all.length > 1) throw new TelemetryError("invalid_query");
    return all[0];
  };
  const view = get("view") ?? "overview";
  if (!["overview", "advisories", "exposures"].includes(view))
    throw new TelemetryError("invalid_query");
  const q = get("q")?.trim();
  if (
    q !== undefined &&
    (q.length < 1 || q.length > 100 || /[\x00-\x1f\x7f]/.test(q))
  )
    throw new TelemetryError("invalid_query");
  const advisoryId = get("advisoryId");
  if (advisoryId !== undefined && !normId(advisoryId))
    throw new TelemetryError("invalid_query");
  const provider = get("provider"),
    severity = get("severity"),
    status = get("status"),
    ecosystem = get("ecosystem"),
    pkg = get("package"),
    offset = get("offset"),
    kev = get("kev");
  if (provider !== undefined && !providers.includes(provider as Provider))
    throw new TelemetryError("invalid_query");
  if (severity !== undefined && !severities.includes(severity as Severity))
    throw new TelemetryError("invalid_query");
  if (
    status !== undefined &&
    !["active", "withdrawn", "removed_from_source"].includes(status)
  )
    throw new TelemetryError("invalid_query");
  if ((ecosystem === undefined) !== (pkg === undefined))
    throw new TelemetryError("invalid_query");
  if (
    ecosystem !== undefined &&
    !(ecosystems as readonly string[]).includes(ecosystem)
  )
    throw new TelemetryError("invalid_query");
  if (
    pkg !== undefined &&
    (pkg.length < 1 || pkg.length > 300 || /[\x00-\x1f\x7f]/.test(pkg))
  )
    throw new TelemetryError("invalid_query");
  if (kev !== undefined && kev !== "1")
    throw new TelemetryError("invalid_query");
  const n = offset === undefined ? 0 : Number(offset);
  if (!Number.isInteger(n) || n < 0 || n > 2000)
    throw new TelemetryError("invalid_query");
  return {
    view: view as ExternalQuery["view"],
    advisoryId: advisoryId ? normId(advisoryId)! : undefined,
    q,
    provider: provider as Provider | undefined,
    severity: severity as Severity | undefined,
    kev: kev === "1" || undefined,
    ecosystem,
    packageName: pkg,
    status: status as ExternalQuery["status"],
    offset: n,
  };
}
