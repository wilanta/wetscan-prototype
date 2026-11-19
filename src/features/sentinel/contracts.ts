import type {
  Grant,
  IntegrationResult,
  IntelligencePort,
  InventoryItem,
  RepositoryRef,
  SentinelPort,
} from "../guard/contracts";
import type { SentinelIncidentOverlaySource } from "../canvas/contracts";
import type { IncidentSummary, SecurityOverlay } from "../canvas/types";
import type {
  Channel,
  EvidenceRef,
  Incident,
  NotificationMessage,
  ResponseProposal,
  SentinelProjectContext,
  SentinelScope,
  StoredSecurityEvent,
  VerificationResult,
} from "./types";

export type GuardPipelinePayload = Parameters<SentinelPort["publish"]>[2];
export type GuardInventoryItem = InventoryItem;
export type GuardBridgePorts = {
  pipeline: SentinelPort;
  inventory: IntelligencePort;
};
interface GuardHandoffBase extends SentinelScope {
  schemaVersion: 1;
  producer: "guard";
  deliveryId: string;
  idempotencyKey: string;
  repository: RepositoryRef;
  evidence: EvidenceRef[];
  occurredAt: string;
}
/** Internal audit input only; never an attack/detection event. */
export interface GuardPipelineEventV1 extends GuardHandoffBase {
  category: "security_pipeline";
  event: GuardPipelinePayload;
}
/** Repository-level inventory is potential exposure context, not deployment proof. */
export interface GuardInventoryV1 extends GuardHandoffBase {
  category: "dependency_inventory";
  scanId: string;
  inventory: InventoryItem[];
  exposureBasis: "repository_only";
}
/** Resolve by trusted scan storage, never by browser values or fixture runner. */
export interface GuardProducerProof {
  scope: SentinelScope;
  scanId: string;
  repository: RepositoryRef;
  evidenceIds: readonly string[];
  origin: "observed_scan" | "controlled_test";
}
export interface GuardHandoffConsumer {
  pipeline(
    grant: Grant,
    event: GuardPipelineEventV1,
  ): Promise<IntegrationResult<{ deliveryId: string }>>;
  inventory(
    grant: Grant,
    inventory: GuardInventoryV1,
  ): Promise<IntegrationResult<{ deliveryId: string }>>;
}
export interface CanvasIncidentHandoffV1 extends SentinelScope {
  schemaVersion: 1;
  category: "runtime_incidents";
  projectRef: string;
  sourceRevision: string;
  generatedAt: string;
  coverage: SecurityOverlay["sentinel"];
  incidents: (IncidentSummary & {
    simulated: false;
    sourceId: string;
    occurredAt: string;
    evidenceIds: string[];
  })[];
  evidence: EvidenceRef[];
}
/** The existing Canvas interface is retained; scope is bound by a server factory. */
export interface CanvasIncidentSourceFactory {
  create(context: SentinelProjectContext): SentinelIncidentOverlaySource;
}
export interface SentinelQueryPort {
  incidents(
    context: SentinelProjectContext,
  ): Promise<IntegrationResult<Incident[]>>;
  events(
    context: SentinelProjectContext,
  ): Promise<IntegrationResult<StoredSecurityEvent[]>>;
}
export interface ResponsePort {
  configured: boolean;
  apply(
    context: SentinelProjectContext,
    proposal: ResponseProposal,
  ): Promise<
    IntegrationResult<{
      actionId: string;
      status: "action_applied";
      evidenceIds: string[];
    }>
  >;
  rollback(
    context: SentinelProjectContext,
    actionId: string,
  ): Promise<
    IntegrationResult<{ status: "rolled_back"; evidenceIds: string[] }>
  >;
  /** Additive S05: read the target's actual enforcement state (reconcile). Never mutates. */
  inspect?(
    context: SentinelProjectContext,
  ): Promise<
    IntegrationResult<{
      active: boolean;
      actionId: string | null;
      expiresAt: string | null;
    }>
  >;
}
export interface VerificationPort {
  verify(
    context: SentinelProjectContext,
    actionId: string,
  ): Promise<IntegrationResult<VerificationResult>>;
}
export interface NotificationProviderPort {
  channel: Channel;
  configured: boolean;
  send(
    context: SentinelProjectContext,
    message: NotificationMessage,
  ): Promise<
    IntegrationResult<{
      status: "accepted";
      providerMessageId: string;
      acceptedAt: string;
    }>
  >;
  /** Only verified provider receipt evidence can advance accepted to delivered. */
  receipt?(
    providerMessageId: string,
  ): Promise<
    IntegrationResult<{ status: "delivered" | "failed"; recordedAt: string }>
  >;
}
export interface AdvisoryFeedPort {
  provider: "cisa_kev" | "ghsa" | "osv" | "nvd";
  sync(
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<
    IntegrationResult<{
      cursor: string | null;
      sourceUpdatedAt: string;
      advisories: {
        id: string;
        aliases: string[];
        sourceUrl: string;
        summary: string;
      }[];
    }>
  >;
}
export interface AIExplanationPort {
  configured: boolean;
  explain(
    redactedEvidence: string,
  ): Promise<
    IntegrationResult<{ text: string; untrusted: true; purpose: "draft_only" }>
  >;
}
/** Additive S07 typed summary for decoy hits forwarded through S02/S04 into future S08 case archival. */
export interface GhostDecoyHitSummaryV1 extends SentinelScope {
  schemaVersion: 1;
  decoyId: string;
  sourceId: string;
  eventId: string;
  origin: "runtime" | "controlled_test";
  routeTemplate: string;
  method: string;
  signalClassification:
    | "decoy_access"
    | "automated_crawler_or_scanner"
    | "controlled_test_hit";
  occurredAt: string;
  ingestedAt: string;
  evidence: EvidenceRef;
}
/** Typed integration seam for future S08 Internal Intelligence Case Library. Not implemented in S07. */
export interface CaseLibraryArchiveCandidateV1 extends SentinelScope {
  schemaVersion: 1;
  incidentId: string;
  sourceId: string;
  origin: "runtime" | "controlled_test";
  category: "authentication" | "http" | "decoy";
  evidenceIds: string[];
  decoyHits?: GhostDecoyHitSummaryV1[];
  falsePositiveNotice: string;
}
export interface CaseLibraryPort {
  configured: boolean;
  archiveIncidentDraft(
    context: SentinelProjectContext,
    candidate: CaseLibraryArchiveCandidateV1,
  ): Promise<
    IntegrationResult<{
      caseId: string;
      status: "draft_pending_review";
    }>
  >;
}
