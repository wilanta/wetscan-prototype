import type { ScanJob } from "../contracts";
import type { PlatformDatabase } from "../../../platform/database";
import type { SourceAccess } from "./model";
import { LiveGuardError } from "./model";
import { GuardLiveService } from "./service";
import { PostgresGuardStore } from "./persistence";
import { PostgresGuardArtifacts } from "./product-artifacts";
import { repositoryAdmission } from "./product-admission";
import {
  validateQualification,
  repositoryScanKind,
  type RepositoryScanPolicy,
  type RepositoryScanEngine,
  type ScannerQualification,
} from "./product-policy";
import type { SandboxSpec } from "../../../../worker/guard/sandbox";
/** Host composition after deployment verification; never loaded from request JSON or an acceptance permit. */
export async function qualifiedProductService(input: {
  db: PlatformDatabase;
  policy: RepositoryScanPolicy;
  deployments: readonly {
    engine: RepositoryScanEngine;
    spec: SandboxSpec;
    qualification: ScannerQualification;
  }[];
  source(branch: string, commit: string): SourceAccess;
  /** Must verify schema/RLS, worker+source broker readiness and current physical sandbox identity. */
  verifyRuntime(): Promise<void>;
  onQueued?(job: ScanJob): Promise<void>;
}) {
  if (input.db.module !== "guard" || input.db.worker)
    throw new LiveGuardError("execution_not_ready");
  const policy = structuredClone(input.policy),
    deployments = structuredClone(input.deployments);
  const verify = async () => {
    for (const engine of policy.engines) {
      const d = deployments.find((d) => d.engine === engine);
      if (!d) throw new LiveGuardError("execution_not_ready");
      validateQualification(d.qualification, engine, d.spec);
    }
    await input.verifyRuntime();
  };
  await verify();
  const storage = new PostgresGuardStore(input.db, repositoryScanKind);
  return new GuardLiveService(
    storage,
    {
      database: "approved",
      schema: "verified",
      queue: "verified",
      sandbox: "verified",
      workerAuthorization: "configured",
      execution: "REPOSITORY_SCAN_CONFIGURED",
    },
    repositoryAdmission({
      storage,
      policy,
      verifyReady: verify,
      source: input.source,
      onQueued: input.onQueued,
    }),
    new PostgresGuardArtifacts(input.db),
  );
}
