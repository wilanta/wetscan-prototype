/* Owner runs this whole script in the existing localhost:3000 app session. No login/reset or paste-warning bypass. */
(async () => {
  const root = globalThis;
  const target = "wilanta/wetscan-prototype";
  const preparedHead = "5e52ac2d9df641eebef5cb4818c4efb7887c0c5c";
  const report = {
    schema: "guard-g03-prototype-readonly-v1",
    classification:
      "OWNER_SESSION_EXISTING_G02_METADATA_NOT_PATCH_AUTHORIZATION",
    target,
    preparedMasterHead: preparedHead,
    currentHeadVerified: false,
    requests: [],
    scans: [],
    views: [],
    historyTruncated: false,
    repositorySourceAcquired: false,
    scannerStarted: false,
    providerCalled: false,
    githubWritten: false,
  };
  const sha = (s, n) =>
    typeof s === "string" && new RegExp("^[a-f0-9]{" + n + "}$").test(s);
  const safe = (value, max = 512) =>
    typeof value === "string"
      ? value
          .replace(
            /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{12,})\b/g,
            "[REDACTED]",
          )
          .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
          .replace(
            /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
            "[REDACTED EMAIL]",
          )
          .replace(
            /(?:postgres(?:ql)?|mysql|mongodb|redis):\/\/\S+/gi,
            "[REDACTED CONNECTION]",
          )
          .split("")
          .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
          .join("")
          .slice(0, max)
      : null;
  const codes = new Set([
    "approval_required",
    "not_configured",
    "configuration",
    "not_found",
    "guard_unavailable",
    "storage_unavailable",
    "unauthenticated",
    "github_unavailable",
    "invalid_response",
    "request_failed",
  ]);
  async function get(path) {
    if (
      report.requests.length >= 8 ||
      !/^\/api\/onboarding$|^\/api\/guard\/projects\/github-[1-9]\d*\/(?:readiness|scans(?:\?limit=50(?:&after=[a-f0-9]{64})?)?|scans\/[a-f0-9]{64}\/view)$/.test(
        path,
      )
    )
      throw Error("request_budget_or_path");
    const probe = { path, method: "GET", httpStatus: null, errorCode: null };
    report.requests.push(probe);
    try {
      const r = await root.fetch(path, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: { Accept: "application/json" },
        signal: root.AbortSignal.timeout(30000),
      });
      probe.httpStatus = r.status;
      let body;
      try {
        body = await r.json();
      } catch {
        probe.errorCode = "invalid_response";
        return null;
      }
      if (!r.ok) {
        probe.errorCode = codes.has(body?.error)
          ? body.error
          : "unrecognized_error";
        return null;
      }
      return body;
    } catch {
      probe.errorCode = "request_failed";
      return null;
    }
  }
  if (root.location?.origin !== "http://localhost:3000") {
    report.status = "WRONG_ORIGIN_STOP";
    root.console.log(JSON.stringify(report));
    return report;
  }
  try {
    const account = await get("/api/onboarding");
    if (account?.authenticated !== true) {
      report.status = "EXISTING_SESSION_UNAVAILABLE";
      return finish();
    }
    const repos = Array.isArray(account.profile?.repositories)
      ? account.profile.repositories
      : [];
    const matches = repos.filter(
      (r) =>
        typeof r.fullName === "string" &&
        r.fullName.toLowerCase() === target.toLowerCase(),
    );
    if (
      matches.length !== 1 ||
      !Number.isSafeInteger(matches[0].id) ||
      matches[0].id < 1
    ) {
      report.status = "TARGET_NOT_SELECTED_OR_AMBIGUOUS";
      return finish();
    }
    const repo = matches[0],
      projectId = "github-" + repo.id,
      api = "/api/guard/projects/" + projectId;
    report.repository = {
      repositoryId: String(repo.id),
      fullName: target,
      defaultBranch: safe(repo.defaultBranch),
      projectId,
      identitySource:
        "Existing session selection; server revalidation still required",
    };
    const ready = await get(api + "/readiness");
    const pick = (v, values) => (values.includes(v) ? v : null);
    report.readiness = ready
      ? {
          database: pick(ready.database, [
            "approved",
            "approval_required",
            "not_configured",
            "unavailable",
          ]),
          schema: pick(ready.schema, ["verified", "unverified"]),
          scanning: pick(ready.product?.repositoryScanning, [
            "BLOCKED",
            "CONFIGURED",
          ]),
        }
      : null;
    let after;
    for (let page = 0; page < 2; page++) {
      const history = await get(
        api + "/scans?limit=50" + (after ? "&after=" + after : ""),
      );
      if (!Array.isArray(history?.scans)) {
        report.status = "SCAN_HISTORY_UNAVAILABLE";
        return finish();
      }
      for (const s of history.scans) {
        if (
          !sha(s.id, 64) ||
          String(s.repository?.repositoryId) !== String(repo.id)
        )
          throw Error("history_binding");
        report.scans.push({
          scanId: s.id,
          status: safe(s.status, 64),
          branch: safe(s.repository.branch),
          commit: sha(s.repository.commit, 40) ? s.repository.commit : null,
          createdAt: safe(s.createdAt, 40),
        });
      }
      if (history.scans.length < 50) break;
      after = history.scans[history.scans.length - 1]?.id;
      if (!sha(after, 64)) throw Error("history_cursor");
      if (page === 1) report.historyTruncated = true;
    }
    const ordered = report.scans
      .filter((s) => ["completed", "completed_partial"].includes(s.status))
      .sort(
        (a, b) =>
          Number(b.commit === preparedHead) -
            Number(a.commit === preparedHead) ||
          (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0),
      );
    for (const s of ordered.slice(0, 4)) {
      const v = await get(api + "/scans/" + s.scanId + "/view");
      if (!v) continue;
      if (
        v.scanId !== s.scanId ||
        v.status !== s.status ||
        String(v.repository?.repositoryId) !== String(repo.id) ||
        v.repository.commit !== s.commit ||
        v.repository.branch !== s.branch ||
        !Array.isArray(v.findings) ||
        !Array.isArray(v.engines)
      )
        throw Error("view_binding");
      const run = v.engines.find((r) => r.engine === "sast"),
        x = run?.executionEvidence;
      const findings = v.findings.filter((f) => f.source?.engine === "sast");
      report.views.push({
        scanId: s.scanId,
        revision: Number.isSafeInteger(v.revision) ? v.revision : null,
        execution: safe(v.execution, 64),
        status: s.status,
        branch: s.branch,
        commit: s.commit,
        matchesPreparedMasterHead:
          s.branch === "master" && s.commit === preparedHead,
        sourceCoverage: v.sourceCoverage
          ? {
              status: pick(v.sourceCoverage.status, ["complete", "partial"]),
              retrievedFiles: Number.isSafeInteger(
                v.sourceCoverage.retrievedFiles,
              )
                ? v.sourceCoverage.retrievedFiles
                : null,
              excludedFiles: Number.isSafeInteger(
                v.sourceCoverage.excludedFiles,
              )
                ? v.sourceCoverage.excludedFiles
                : null,
              treeTruncated:
                typeof v.sourceCoverage.treeTruncated === "boolean"
                  ? v.sourceCoverage.treeTruncated
                  : null,
            }
          : null,
        sastRunCount: v.engines.filter((r) => r.engine === "sast").length,
        scanner: run
          ? {
              scanner: safe(run.scanner, 100),
              version: safe(run.version, 100),
              rulePack: safe(run.rulePack, 256),
              status: safe(run.status, 64),
              artifactDigest: sha(run.artifactDigest, 64)
                ? run.artifactDigest
                : null,
              executionEvidence: x
                ? {
                    version: x.version === 1 ? 1 : null,
                    imageId: /^sha256:[a-f0-9]{64}$/.test(x.imageId ?? "")
                      ? x.imageId
                      : null,
                    specDigest: sha(x.specDigest, 64) ? x.specDigest : null,
                    installationArtifactSha256: sha(
                      x.installationArtifactSha256,
                      64,
                    )
                      ? x.installationArtifactSha256
                      : null,
                    cleanup:
                      x.cleanup === "VERIFIED" ? "VERIFIED" : "UNVERIFIED",
                  }
                : null,
              coverage: run.coverage
                ? {
                    status: safe(run.coverage.status, 32),
                    scannedFiles: Number.isSafeInteger(
                      run.coverage.scannedFiles,
                    )
                      ? run.coverage.scannedFiles
                      : null,
                    eligibleFiles: Number.isSafeInteger(
                      run.coverage.eligibleFiles,
                    )
                      ? run.coverage.eligibleFiles
                      : null,
                  }
                : null,
            }
          : null,
        sastCount: findings.length,
        findingsTruncated: findings.length > 100,
        findings: findings
          .slice(0, 100)
          .map((f) => ({
            findingId: sha(f.id, 64) ? f.id : null,
            projectBindingMatches:
              f.projectId === projectId && f.mode === "live",
            status: safe(f.status, 64),
            rule: safe(f.source.ruleId, 256),
            scanner: safe(f.source.scanner, 100),
            scannerVersion: safe(f.source.version, 100),
            rulePack: safe(f.source.rulePack, 256),
            severity:
              f.severityKnown === false
                ? "unknown"
                : pick(f.severity, [
                    "critical",
                    "high",
                    "medium",
                    "low",
                    "info",
                  ]),
            confidence: pick(f.confidence, ["low", "medium", "high"]),
            location: {
              path: safe(f.location?.path),
              line: Number.isSafeInteger(f.location?.line)
                ? f.location.line
                : null,
            },
            evidence: (Array.isArray(f.evidence) ? f.evidence : [])
              .slice(0, 4)
              .map((e) => ({
                id: sha(e.id, 64) ? e.id : null,
                commit: sha(e.commit, 40) ? e.commit : null,
                artifactDigest: sha(e.artifactDigest, 64)
                  ? e.artifactDigest
                  : null,
                synthetic: e.synthetic === false ? false : true,
                recordedAt: safe(e.recordedAt, 40),
              })),
            evidenceTruncated: (f.evidence?.length ?? 0) > 4,
          })),
      });
    }
    report.status = report.scans.length
      ? "EXISTING_METADATA_COLLECTED"
      : "NO_RETAINED_SCAN_RETURNED";
  } catch {
    report.status = "BINDING_OR_RESPONSE_INVALID_STOP";
  }
  return finish();
  function finish() {
    report.limitations = [
      "No repository source/blob acquired. No scan, AI, write, session reset or automatic retry.",
      "Current GitHub HEAD/authorization and evidence must be revalidated before a patch. Partial history/view collection never proves no vulnerabilities.",
      "Evidence summaries, source snippets, account details, cookies, tokens, passwords and unknown response fields are not exported.",
    ];
    const body = JSON.stringify(report, null, 2),
      url = root.URL.createObjectURL(
        new root.Blob([body], { type: "application/json" }),
      );
    const link = root.document.createElement("a");
    link.href = url;
    link.download = "guard-g03-prototype-readonly.json";
    link.click();
    root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
    root.console.log(body);
    return report;
  }
})();
