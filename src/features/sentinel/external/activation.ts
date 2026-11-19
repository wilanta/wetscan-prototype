import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { DatabaseApproval } from "../../../platform/config";
import { integer, PlatformError } from "../../../platform/config";
import { object, timestamp } from "../telemetry/validation";
import { providers, type Provider } from "./model";
import type { SentinelScope } from "../types";

export interface ExternalActivation {
  /** Project scope whose manual sync jobs this worker may claim. */
  scope: SentinelScope;
  notBefore: string;
  providers: Provider[];
  intervalMs: number;
  budgetMs: number;
  ghsaToken?: string;
}
/**
 * Fail-closed network gate. Outbound feed traffic exists only when BOTH `SENTINEL_EXTERNAL_INTEL_ENABLED=1` and an
 * owner approval block `externalIntel` (use `public_advisory_feeds`, named providers, bound scope) are present.
 * Absent either ⇒ the worker creates no feed client and makes no external request.
 */
export async function externalActivation(
  approval: DatabaseApproval,
  env: Readonly<Record<string, string | undefined>>,
): Promise<ExternalActivation | undefined> {
  if (env.SENTINEL_EXTERNAL_INTEL_ENABLED !== "1") return;
  try {
    const r = object(
      (approval as DatabaseApproval & { externalIntel?: unknown })
        .externalIntel,
      [
        "mode",
        "workspaceId",
        "projectId",
        "notBefore",
        "providers",
        "approvedUse",
      ],
    );
    if (
      r.mode !== "live" ||
      r.approvedUse !== "public_advisory_feeds" ||
      typeof r.workspaceId !== "string" ||
      !r.workspaceId ||
      typeof r.projectId !== "string" ||
      !/^github-[1-9]\d{0,15}$/.test(r.projectId) ||
      !Array.isArray(r.providers) ||
      !r.providers.length ||
      r.providers.some((p) => !providers.includes(p as Provider))
    )
      throw Error();
    const notBefore = timestamp(r.notBefore);
    if (Date.parse(notBefore) < Date.parse(approval.approvedAt)) throw Error();
    let ghsaToken: string | undefined;
    const file = env.SENTINEL_FEED_GHSA_TOKEN_FILE;
    if (file) {
      if (!isAbsolute(file)) throw Error();
      ghsaToken = (await readFile(file, "utf8")).trim();
      if (
        ghsaToken.length < 20 ||
        ghsaToken.length > 512 ||
        /[\r\n\0]/.test(ghsaToken)
      )
        throw Error();
    }
    return {
      scope: {
        mode: "live",
        workspaceId: r.workspaceId,
        projectId: r.projectId,
      },
      notBefore,
      providers: [...new Set(r.providers as Provider[])],
      intervalMs: integer(
        env.SENTINEL_FEED_INTERVAL_MS,
        6 * 3_600_000,
        900_000,
        86_400_000,
      ),
      budgetMs: integer(
        env.SENTINEL_FEED_SYNC_BUDGET_MS,
        40_000,
        5_000,
        55_000,
      ),
      ghsaToken,
    };
  } catch {
    throw new PlatformError("approval_required");
  }
}
