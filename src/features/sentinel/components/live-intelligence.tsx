"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  Empty,
  Notice,
  PageHeader,
  SectionHeading,
} from "@/components/ui";
import type {
  IntelCase,
  IntelCaseDetail,
  IntelGroup,
  IntelOverview,
  RuleCandidate,
} from "../intelligence/model";
import { LiveExternalIntelligence } from "./live-external";

const knownErrors: Record<string, string> = {
  intelligence_not_configured:
    "Internal Intelligence is not configured (NOT_CONFIGURED). Database migration 0008 is not applied.",
  incident_not_found: "That incident is no longer available to archive.",
  revision_conflict:
    "This record changed in another session. Refresh and retry.",
  invalid_transition: "That change is not allowed from the current state.",
  group_not_found:
    "That pattern no longer has two or more active cases. Refresh the groups.",
  no_expressible_condition:
    "These cases share no single indicator a rule can express, so no candidate can be drafted.",
  insufficient_cases: "A candidate needs at least two source cases.",
  rule_capacity:
    "This project already has the maximum number of detection rules.",
  case_capacity: "The case library for this project is full.",
  candidate_capacity: "The candidate list for this project is full.",
  project_not_registered: "This project has no Sentinel registration yet.",
  invalid_tags:
    "Tags use lowercase letters, numbers and hyphens (2–32 characters, up to 10).",
  invalid_note: "Notes must be 1–500 characters without control characters.",
  invalid_reason: "A reason of 3–280 characters is required.",
};
async function api(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Error(
      knownErrors[json.error] ??
        (response.status === 401
          ? "Sign in again to access this project."
          : response.status === 404
            ? "This project or record is unavailable to your account."
            : response.status === 503
              ? "Intelligence storage is not configured or temporarily unavailable."
              : "Request rejected. Check your input and try again."),
    );
  return json;
}
const at = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }) + " WIB"
    : "None";
const statusLabel = {
  draft_pending_review: "Draft · pending review",
  reviewed: "Reviewed",
  dismissed: "Dismissed",
} as const;
const reviewTone = {
  DRAFT: "amber",
  APPROVED: "green",
  REJECTED: "red",
} as const;

export function LiveIntelligence({ projectId }: { projectId: string }) {
  const root = `/api/sentinel/projects/${encodeURIComponent(projectId)}/intelligence`;
  const [tab, setTab] = useState<"internal" | "external">("internal");
  const [ov, setOv] = useState<IntelOverview | null>(null);
  const [detail, setDetail] = useState<IntelCaseDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [shelf, setShelf] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [note, setNote] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [promoteConfirm, setPromoteConfirm] = useState<Record<string, boolean>>(
    {},
  );

  const load = useCallback(
    async (caseId?: string) => {
      setError("");
      try {
        const p = new URLSearchParams();
        if (q.trim()) p.set("q", q.trim());
        if (status) p.set("status", status);
        if (shelf) p.set("shelf", shelf);
        setOv(await api(`${root}${p.size ? `?${p}` : ""}`));
        if (caseId) {
          const d: IntelCaseDetail = await api(`${root}?caseId=${caseId}`);
          setDetail(d);
          setTagsText(d.case.tags.join(", "));
        }
      } catch (e) {
        setOv(null);
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [root, q, status, shelf],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function run(body: unknown, reopen?: string) {
    setBusy(true);
    setError("");
    try {
      await api(root, body);
      await load(reopen ?? detail?.case.caseId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const open = (c: IntelCase) => void load(c.caseId);
  const d = detail?.case;

  return (
    <div className="page" style={{ overflowWrap: "anywhere" }}>
      <PageHeader
        eyebrow="SENTINEL · INTELLIGENCE"
        title="Evidence-based case library."
        description="Durable cases archived from your real S04 incidents, explainable pattern groups, and DRAFT rule candidates that only a human can review. Nothing here is simulated, and nothing is enabled automatically."
      />
      <nav className="page-tabs" aria-label="Sentinel live sections">
        {[
          ["Event Explorer", ""],
          ["Telemetry sources", "/sources"],
          ["Detection Rules", "/rules"],
          ["Alerts", "/alerts"],
          ["Incidents", "/incidents"],
          ["Responses", "/responses"],
          ["Notifications", "/notifications"],
          ["Ghost", "/ghost"],
          ["Intelligence", "/intelligence"],
        ].map(([label, path]) => (
          <Link
            key={path}
            href={`/app/projects/${projectId}/sentinel${path}`}
            aria-current={path === "/intelligence" ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="segmented intelligence-tabs" role="group" aria-label="Intelligence source">
        <button className={tab === "internal" ? "selected" : ""} aria-pressed={tab === "internal"} onClick={() => setTab("internal")}>
          Case library (internal)
        </button>
        <button className={tab === "external" ? "selected" : ""} aria-pressed={tab === "external"} onClick={() => setTab("external")}>
          External advisories
        </button>
      </div>
      {tab === "external" && <LiveExternalIntelligence projectId={projectId} />}
      {/* The S08 case library below is unchanged; it is only hidden (not unmounted) while the external tab is shown. */}
      <div hidden={tab === "external"}>
      <Notice tone="amber">
        {ov?.grouping.disclaimer ??
          "Similarity is a deterministic indicator match. It does not prove a common attacker or successful exploitation."}{" "}
        Archiving a case never closes, resolves, mitigates or neutralizes the
        source incident.
      </Notice>
      {error && (
        <div role="alert">
          <Notice tone="amber">{error}</Notice>
        </div>
      )}
      <div className="actions">
        <Button
          variant="secondary"
          disabled={loading || busy}
          onClick={() => void load(d?.caseId)}
        >
          Refresh Intelligence
        </Button>
      </div>
      {loading && <p role="status">Loading case library…</p>}

      {!loading && ov && (
        <>
          <Card>
            <SectionHeading title="Archive an incident as a case">
              <Badge tone="blue">
                {ov.archivableIncidents.length} not yet archived
              </Badge>
            </SectionHeading>
            {ov.archivableIncidents.length ? (
              ov.archivableIncidents.map((i) => (
                <div className="history-row" key={i.incidentId}>
                  <div>
                    <strong>{i.title}</strong>
                    <small>
                      {i.category} · {i.severity} · source incident {i.status} ·{" "}
                      {i.origin === "controlled_test"
                        ? "controlled test"
                        : "runtime"}{" "}
                      · last seen {at(i.lastObservedAt)}
                    </small>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    aria-label={`Archive incident ${i.title}`}
                    onClick={() =>
                      void run({ action: "archive", incidentId: i.incidentId })
                    }
                  >
                    Archive as case
                  </Button>
                </div>
              ))
            ) : (
              <Empty
                title="No unarchived incidents"
                description="Incidents from authorized telemetry appear here once detection opens them."
              />
            )}
          </Card>

          <Card>
            <SectionHeading title="Case library">
              <Badge>{ov.cases.length} shown</Badge>
            </SectionHeading>
            <div className="actions">
              <input
                aria-label="Search cases by title"
                placeholder="Search title"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select
                aria-label="Filter by case status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Any status</option>
                <option value="draft_pending_review">
                  Draft · pending review
                </option>
                <option value="reviewed">Reviewed</option>
                <option value="dismissed">Dismissed</option>
              </select>
              <select
                aria-label="Filter by shelf"
                value={shelf}
                onChange={(e) => setShelf(e.target.value)}
              >
                <option value="">Active and shelved</option>
                <option value="active">Active</option>
                <option value="shelved">Shelved</option>
              </select>
            </div>
            {ov.cases.length ? (
              ov.cases.map((c) => (
                <div className="history-row" key={c.caseId}>
                  <div>
                    <strong>{c.title}</strong>
                    <small>
                      {c.category} · {c.severity} ·{" "}
                      {c.origin === "controlled_test"
                        ? "controlled test"
                        : "runtime"}{" "}
                      · archived {at(c.archivedAt)}
                    </small>
                    <div className="actions">
                      <Badge
                        tone={
                          c.status === "reviewed"
                            ? "green"
                            : c.status === "dismissed"
                              ? "neutral"
                              : "amber"
                        }
                      >
                        {statusLabel[c.status]}
                      </Badge>
                      <Badge
                        tone={c.shelfState === "active" ? "blue" : "neutral"}
                      >
                        {c.shelfState === "active" ? "Active shelf" : "Shelved"}
                      </Badge>
                      <Badge
                        tone={
                          c.incident.state === "available" ? "blue" : "neutral"
                        }
                      >
                        {c.incident.state === "available"
                          ? `Source incident ${c.incident.status}`
                          : "Source incident expired"}
                      </Badge>
                      <Badge
                        tone={
                          c.evidence.state === "complete" ? "green" : "amber"
                        }
                      >
                        Evidence {c.evidence.state} ({c.evidence.available}/
                        {c.evidence.total})
                      </Badge>
                      {c.tags.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => open(c)}
                    aria-label={`Open case ${c.title}`}
                  >
                    Open
                  </Button>
                </div>
              ))
            ) : (
              <Empty
                title="No cases match"
                description="Archive an incident above, or clear the filters."
              />
            )}
          </Card>

          {d && (
            <Card>
              <SectionHeading title={`Case: ${d.title}`}>
                <Badge tone="blue">revision {d.revision}</Badge>
              </SectionHeading>
              <p>
                Archived by {d.archivedBy} at {at(d.archivedAt)} from incident{" "}
                {d.incidentId} (it was {d.incidentStatusAtArchive} at archive) ·
                rule version {d.ruleVersion}.
              </p>
              {d.incident.state === "available" &&
                d.incident.changedSinceArchive && (
                  <Notice tone="amber">
                    The source incident changed after archival. Indicators below
                    are the archive-time snapshot.
                  </Notice>
                )}
              {d.incident.state === "expired" && (
                <Notice tone="amber">
                  The source incident has passed retention and is no longer
                  stored. This case preserves only its archive-time snapshot.
                </Notice>
              )}
              {d.evidence.state !== "complete" && (
                <Notice tone="amber">
                  {d.evidence.state === "partial"
                    ? `${d.evidence.missing} of ${d.evidence.total} evidence events are no longer stored.`
                    : "None of the referenced evidence events are still stored."}{" "}
                  Missing evidence is never reconstructed.
                </Notice>
              )}
              <p>
                Indicators: kinds {d.indicators.eventKinds.join(", ") || "none"}{" "}
                · reason codes {d.indicators.reasonCodes.join(", ") || "none"} ·
                methods {d.indicators.methods.join(", ") || "none"} · status
                codes {d.indicators.statusCodes.join(", ") || "none"} ·{" "}
                {d.indicators.evidenceCount} events over{" "}
                {d.indicators.spanSeconds}s.
              </p>
              <ul aria-label="Evidence references">
                {(d.evidenceRefs ?? []).map((r) => (
                  <li key={r.id}>
                    {r.kind} · {at(r.occurredAt)} ·{" "}
                    <Badge tone={r.state === "available" ? "green" : "red"}>
                      {r.state}
                    </Badge>
                  </li>
                ))}
              </ul>
              <div className="actions">
                <label>
                  Tags
                  <input
                    aria-label="Case tags"
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    placeholder="brute-force, week-46"
                  />
                </label>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run({
                      action: "tag",
                      caseId: d.caseId,
                      expectedRevision: d.revision,
                      tags: tagsText
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                >
                  Save tags
                </Button>
              </div>
              <div className="actions">
                {d.status !== "reviewed" && d.status !== "dismissed" && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run({
                        action: "set_status",
                        caseId: d.caseId,
                        expectedRevision: d.revision,
                        status: "reviewed",
                      })
                    }
                  >
                    Mark case reviewed
                  </Button>
                )}
                {d.status !== "dismissed" ? (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run({
                        action: "set_status",
                        caseId: d.caseId,
                        expectedRevision: d.revision,
                        status: "dismissed",
                      })
                    }
                  >
                    Dismiss case
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run({
                        action: "set_status",
                        caseId: d.caseId,
                        expectedRevision: d.revision,
                        status: "draft_pending_review",
                      })
                    }
                  >
                    Reopen case
                  </Button>
                )}
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run({
                      action: "set_shelf",
                      caseId: d.caseId,
                      expectedRevision: d.revision,
                      shelfState:
                        d.shelfState === "active" ? "shelved" : "active",
                    })
                  }
                >
                  {d.shelfState === "active"
                    ? "Shelve case"
                    : "Return to active shelf"}
                </Button>
              </div>
              <small>
                {d.incidentPinned
                  ? "While active and not dismissed, this case keeps its source incident from expiring through retention."
                  : "This case does not pin its source incident; normal retention applies."}
              </small>
              <div className="actions">
                <label>
                  Annotation
                  <textarea
                    aria-label="Investigator note"
                    value={note}
                    maxLength={500}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <Button
                  variant="secondary"
                  disabled={busy || !note.trim()}
                  onClick={async () => {
                    await run({ action: "annotate", caseId: d.caseId, note });
                    setNote("");
                  }}
                >
                  Add annotation
                </Button>
              </div>
              <h3>Audit trail</h3>
              <ol aria-label="Case audit trail">
                {detail!.audit.map((a) => (
                  <li key={a.auditId}>
                    #{a.sequence} {a.action.replaceAll("_", " ")} · {a.actorId}{" "}
                    · {at(a.recordedAt)} — {a.summary}
                    {a.note ? ` “${a.note}”` : ""}
                  </li>
                ))}
              </ol>
            </Card>
          )}

          <Card>
            <SectionHeading title="Pattern groups">
              <Badge tone="blue">{ov.groups.length} groups</Badge>
            </SectionHeading>
            <small>
              Grouping v{ov.grouping.version}: exact match on normalized
              indicators within {ov.grouping.windowDays} days.{" "}
              {ov.ungroupedCount} case(s) are ungrouped (single, missing
              indicators, dismissed or shelved).
            </small>
            {ov.groups.length ? (
              ov.groups.map((g: IntelGroup) => (
                <div className="history-row" key={g.groupId}>
                  <div>
                    <strong>
                      {g.caseIds.length}{" "}
                      {g.origin === "controlled_test"
                        ? "controlled-test"
                        : "runtime"}{" "}
                      cases · {g.category}
                    </strong>
                    <ul>
                      {g.explanation.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <small>
                      Confidence: exact indicator match only. {g.limitations[0]}
                    </small>
                  </div>
                  {g.candidateId ? (
                    <Badge tone="blue">Candidate exists</Badge>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run({ action: "propose", groupId: g.groupId })
                      }
                    >
                      Propose DRAFT rule
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <Empty
                title="No groups yet"
                description="Two or more active cases with identical indicators form a group."
              />
            )}
          </Card>

          <Card>
            <SectionHeading title="Rule candidates (human review required)">
              <Badge tone="amber">{ov.candidates.length} candidates</Badge>
            </SectionHeading>
            {ov.candidates.length ? (
              ov.candidates.map((c: RuleCandidate) => (
                <div className="history-row" key={c.candidateId}>
                  <div>
                    <strong>{c.definition.name}</strong>
                    <div className="actions">
                      <Badge tone={reviewTone[c.reviewStatus]}>
                        Review {c.reviewStatus}
                      </Badge>
                      <Badge tone={c.validatedAt ? "green" : "neutral"}>
                        {c.validatedAt ? "Validated" : "Not validated"}
                      </Badge>
                      <Badge
                        tone={c.ruleStatus === "ENABLED" ? "red" : "neutral"}
                      >
                        {c.promotedRuleId
                          ? `S03 rule ${c.ruleStatus ?? "unknown"}`
                          : "No S03 rule"}
                      </Badge>
                    </div>
                    <small>
                      {c.definition.eventKinds.join(", ")} ·{" "}
                      {c.definition.conditions
                        .map((x) => `${x.field}=${x.value}`)
                        .join(" & ") || "no conditions"}{" "}
                      · {c.definition.threshold} in {c.definition.windowSeconds}
                      s · from {c.caseIds.length} cases · proposed by{" "}
                      {c.proposedBy}
                    </small>
                    <small>
                      {c.basis.thresholdRationale} {c.basis.limitations.at(-1)}
                    </small>
                    {c.reviewedBy && (
                      <small>
                        {c.reviewStatus} by {c.reviewedBy} at {at(c.reviewedAt)}
                        : {c.reviewReason}
                      </small>
                    )}
                    {c.reviewStatus === "DRAFT" && (
                      <div className="actions">
                        <input
                          aria-label="Review reason"
                          placeholder="Reason (required)"
                          value={reasons[c.candidateId] ?? ""}
                          onChange={(e) =>
                            setReasons({
                              ...reasons,
                              [c.candidateId]: e.target.value,
                            })
                          }
                        />
                        {(["approve", "reject"] as const).map((decision) => (
                          <Button
                            key={decision}
                            variant="secondary"
                            disabled={
                              busy ||
                              (reasons[c.candidateId] ?? "").trim().length < 3
                            }
                            onClick={() =>
                              void run({
                                action: "review",
                                candidateId: c.candidateId,
                                expectedRevision: c.revision,
                                decision,
                                reason: reasons[c.candidateId],
                              })
                            }
                          >
                            {decision === "approve"
                              ? "Approve candidate"
                              : "Reject candidate"}
                          </Button>
                        ))}
                      </div>
                    )}
                    {c.reviewStatus === "APPROVED" && !c.validatedAt && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run({
                            action: "validate",
                            candidateId: c.candidateId,
                            expectedRevision: c.revision,
                          })
                        }
                      >
                        Validate definition
                      </Button>
                    )}
                    {c.validatedAt && !c.promotedRuleId && (
                      <div className="actions">
                        <label>
                          <input
                            type="checkbox"
                            checked={promoteConfirm[c.candidateId] ?? false}
                            onChange={(e) =>
                              setPromoteConfirm({
                                ...promoteConfirm,
                                [c.candidateId]: e.target.checked,
                              })
                            }
                          />{" "}
                          I understand this creates a DRAFT rule only and does
                          not enable detection.
                        </label>
                        <Button
                          variant="secondary"
                          disabled={busy || !promoteConfirm[c.candidateId]}
                          onClick={() =>
                            void run({
                              action: "promote",
                              candidateId: c.candidateId,
                              expectedRevision: c.revision,
                            })
                          }
                        >
                          Create DRAFT detection rule
                        </Button>
                      </div>
                    )}
                    {c.promotedRuleId && (
                      <small>
                        Rule {c.promotedRuleId} is {c.ruleStatus}. Enabling is a
                        separate action in{" "}
                        <Link
                          href={`/app/projects/${projectId}/sentinel/rules`}
                        >
                          Detection Rules
                        </Link>
                        .
                      </small>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <Empty
                title="No candidates"
                description="Propose a DRAFT rule from a pattern group. Candidates are never rules until a human approves, validates and creates a DRAFT, and a separate action enables it."
              />
            )}
          </Card>

          <Card>
            <SectionHeading title="AI explanation">
              <Badge>Disabled</Badge>
            </SectionHeading>
            <p>{ov.aiExplanation.reason}</p>
          </Card>
          <Card>
            <SectionHeading title="Recent Intelligence audit" />
            {ov.audit.length ? (
              <ol aria-label="Recent audit">
                {ov.audit.map((a) => (
                  <li key={a.auditId}>
                    {a.action.replaceAll("_", " ")} · {a.actorId} ·{" "}
                    {at(a.recordedAt)} — {a.summary}
                  </li>
                ))}
              </ol>
            ) : (
              <p>No Intelligence activity recorded yet.</p>
            )}
          </Card>
        </>
      )}
      </div>
    </div>
  );
}
