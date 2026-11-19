export type GithubDiagnostic = {
  boundary: "github_api" | "github_oauth" | "github_source";
  reason:
    "DNS" | "TLS" | "CONNECTION" | "TIMEOUT" | "UPSTREAM_HTTP" | "UNKNOWN";
  upstreamStatus?: number;
};
export function transportDiagnostic(
  error: unknown,
  boundary: GithubDiagnostic["boundary"],
): GithubDiagnostic {
  const e = error as {
    name?: string;
    code?: string;
    cause?: { code?: string };
  };
  const code = e?.cause?.code ?? e?.code ?? "";
  const reason = /^(ENOTFOUND|EAI_AGAIN)$/.test(code)
    ? "DNS"
    : /CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code)
      ? "TLS"
      : /^(ECONNREFUSED|ECONNRESET|ENETUNREACH|EHOSTUNREACH|UND_ERR_CONNECT_TIMEOUT)$/.test(
            code,
          )
        ? "CONNECTION"
        : /^(AbortError|TimeoutError)$/.test(e?.name ?? "") ||
            code === "UND_ERR_HEADERS_TIMEOUT"
          ? "TIMEOUT"
          : "UNKNOWN";
  return { boundary, reason };
}
export function safeGithubDiagnostic(
  error: unknown,
): GithubDiagnostic | undefined {
  const d = (error as { githubDiagnostic?: GithubDiagnostic })
    ?.githubDiagnostic;
  if (
    !d ||
    !["github_api", "github_oauth", "github_source"].includes(d.boundary) ||
    ![
      "DNS",
      "TLS",
      "CONNECTION",
      "TIMEOUT",
      "UPSTREAM_HTTP",
      "UNKNOWN",
    ].includes(d.reason)
  )
    return;
  return {
    boundary: d.boundary,
    reason: d.reason,
    ...(Number.isInteger(d.upstreamStatus) &&
    d.upstreamStatus! >= 400 &&
    d.upstreamStatus! <= 599
      ? { upstreamStatus: d.upstreamStatus }
      : {}),
  };
}
