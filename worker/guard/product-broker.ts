import { tagFailure } from "./source-failure";
import type {
  Grant,
  ScanJob,
  AuthorizedSnapshot,
  ScanRequest,
  SnapshotPort,
} from "../../src/features/guard/contracts";
import type {
  SourceAccess,
  SourceCoverage,
} from "../../src/features/guard/live/model";
import { LiveGuardError } from "../../src/features/guard/live/model";
import { GuardSnapshotAdapter } from "../../src/features/guard/live/snapshot";
import { authorize } from "../../src/features/guard/security";
import { fingerprint } from "../../src/platform/identity";
import {
  operationalJob,
  validateProductPolicy,
  type RepositoryScanPolicy,
} from "../../src/features/guard/live/product-policy";
/** Lives in the Auth process; untrusted code executes only in scanner containers. */
export class ProductSessionBroker {
  private closed = false;
  private acquired = false;
  private coverage: SourceCoverage | undefined;
  private failedCleanup = false;
  private owned = new Set<AuthorizedSnapshot>();
  readonly snapshots: SnapshotPort;
  constructor(
    private job: ScanJob,
    private policy: RepositoryScanPolicy,
    private source: SourceAccess,
    readonly owner = new GuardSnapshotAdapter(source, undefined, undefined, {
      blobConcurrency: 3,
      largeDependencyManifests: true,
    }),
  ) {
    if (!operationalJob(job)) throw new LiveGuardError("not_found", 404);
    validateProductPolicy(policy, job);
    this.snapshots = {
      acquire: async (g, r, s) => {
        try {
          if (this.acquired) throw new LiveGuardError("execution_not_ready");
          await this.freshGrant();
          this.sameRequest(r);
          authorize(g, this.job, "scan");
          this.acquired = true;
          const snap = await this.owner.acquire(g, r, s).catch((error) => {
            throw tagFailure(error, "source");
          });
          this.coverage = structuredClone(snap.coverage);
          this.owned.add(snap);
          return snap;
        } catch (error) {
          throw tagFailure(error, "broker");
        }
      },
      refresh: async (s, g) => {
        if (!this.owned.has(s)) throw new LiveGuardError("source_integrity");
        await this.freshGrant();
        const next = await this.owner.refresh(s, g);
        this.owned.delete(s);
        this.owned.add(next);
        return next;
      },
      dispose: async (s) => {
        if (!this.owned.has(s) || this.failedCleanup)
          throw new LiveGuardError("cleanup_failed");
        try {
          await this.owner.dispose(s);
          this.owned.delete(s);
        } catch {
          this.failedCleanup = true;
          throw new LiveGuardError("cleanup_failed");
        }
      },
    };
  }
  sourceCoverage() {
    return this.coverage ? structuredClone(this.coverage) : undefined;
  }
  private sameRequest(r: ScanRequest) {
    if (
      fingerprint({
        repository: r.repository,
        engines: r.engines,
        profile: r.profile,
        idempotencyKey: r.idempotencyKey,
      }) !==
      fingerprint({
        repository: this.job.repository,
        engines: this.job.requestedEngines,
        profile: this.job.profile,
        idempotencyKey: this.job.idempotencyKey,
      })
    )
      throw new LiveGuardError("source_integrity");
  }
  async freshGrant(): Promise<Grant> {
    try {
      if (this.closed) throw new LiveGuardError("source_unavailable");
      const a = await this.source.authorize();
      authorize(a.grant, this.job, "scan");
      if (
        a.grant.actorId !== this.job.audit[0]?.actorId ||
        a.repositoryId !== this.job.repository.repositoryId ||
        a.branch !== this.job.repository.branch
      )
        throw new LiveGuardError("not_found", 404);
      validateProductPolicy(this.policy, this.job);
      return a.grant;
    } catch (error) {
      throw tagFailure(error, "broker");
    }
  }
  async close() {
    this.closed = true;
    if (this.failedCleanup) throw new LiveGuardError("cleanup_failed");
    for (const s of this.owned) {
      try {
        await this.owner.dispose(s);
        this.owned.delete(s);
      } catch {
        this.failedCleanup = true;
        throw new LiveGuardError("cleanup_failed");
      }
    }
  }
}
