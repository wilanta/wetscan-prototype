import "server-only";
import { appJwt } from "../../../lib/auth/github";
import { githubConfig } from "../../../lib/auth/config";
import { openG04, type G04Runtime } from "./db";
import { GithubChecks } from "./checks";
import { fetchTransport, installationTokens } from "./github";
import { G02ScanPort } from "./g02-port";
import { G04Service } from "./service";
import { vercelProvider, vercelToken } from "./vercel";
import { productHostService } from "../live/product-host";
import { LiveGuardError } from "../live/model";

export class G04Disabled extends Error {
  constructor() {
    super("g04_disabled");
  }
}
export interface G04Host {
  rt: G04Runtime;
  /** Intake/API view (app role). */
  api: G04Service;
  /** Dispatcher view (worker role). */
  dispatcher: G04Service;
  checks: GithubChecks;
}
let cached: Promise<G04Host> | undefined;
/** Off unless GUARD_G04_ENABLED=1, like the G02 product flag. Never constructs a scanner by itself: that stays in the G02 product host. */
export function g04Host(env: NodeJS.ProcessEnv = process.env): Promise<G04Host> {
  if (env.GUARD_G04_ENABLED !== "1") return Promise.reject(new G04Disabled());
  cached ??= (async () => {
    const rt = await openG04(env),
      transport = fetchTransport(),
      tokens = installationTokens(transport, appJwt),
      appId = Number(githubConfig().id),
      checks = new GithubChecks(transport, tokens, appId);
    const port = new G02ScanPort({
      transport,
      tokens,
      db: rt.app,
      service: (authority, source) =>
        productHostService(
          { token: undefined, authority, access: "scan", defer: (task) => void task().catch(() => undefined) },
          env,
          source,
        ),
    });
    const provider = (store: typeof rt.appStore) => async (rec: { workspaceId: string; projectId: string; repositoryId: string }) => {
      const m = await store.getMapping(rec);
      if (!m?.enabled || typeof m.config.projectId !== "string") return null;
      return {
        repositoryId: rec.repositoryId,
        provider: vercelProvider({ projectId: m.config.projectId, teamId: typeof m.config.teamId === "string" ? m.config.teamId : undefined, repositoryId: rec.repositoryId }, () => vercelToken(env)),
      };
    };
    const base = { scans: port, checks, appId, baseUrl: env.APP_URL };
    return {
      rt,
      checks,
      api: new G04Service({ ...base, store: rt.appStore, provider: provider(rt.appStore) }),
      dispatcher: new G04Service({ ...base, store: rt.workerStore, provider: provider(rt.workerStore) }),
    };
  })().catch((e) => {
    cached = undefined;
    throw e;
  });
  return cached;
}
export { LiveGuardError };
