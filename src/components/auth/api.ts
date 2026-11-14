"use client";
export const authMessages: Record<string, string> = {
  configuration:
    "Authentication is not configured. Ask the administrator to complete the server configuration.",
  github_app_mismatch:
    "The configured GitHub App ID, slug and client ID do not belong to the same app. Ask the administrator to check the GitHub App settings.",
  github_permissions:
    "The GitHub App installation needs Metadata Read and Contents Read permissions. Ask the administrator to enable them and approve the updated installation.",
  github_setup_misconfigured:
    "The GitHub App setup URL and OAuth settings do not match this flow. Use the WetScan callback as the Setup URL and turn off OAuth during installation.",
  invalid_callback:
    "GitHub returned an unexpected callback. Please restart the connection.",
  invalid_origin:
    "Open WetScan using its configured APP_URL, then restart the connection. Keep the hostname and protocol unchanged.",
  invalid_state:
    "This GitHub connection expired or was already used. Please try again.",
  github_cancelled:
    "GitHub setup was cancelled or requires organization approval. You can try again.",
  github_expired: "GitHub authorization expired. Sign in again to continue.",
  github_denied:
    "GitHub denied the request or its rate limit was reached. Check permissions and try again.",
  github_app_key_invalid:
    "GitHub App signing is not configured correctly. Ask the administrator to provide a valid RSA private key in PEM format.",
  github_app_credentials:
    "GitHub App authentication failed. Ask the administrator to check the server configuration.",
  github_rate_limited: "GitHub rate limit reached. Wait before trying again.",
  github_not_found: "The requested GitHub resource was not found.",
  github_validation:
    "GitHub rejected the request parameters. Restart the connection.",
  github_invalid_request:
    "GitHub rejected the request. Restart the connection.",
  github_response: "GitHub returned an unexpected response. Please retry.",
  github_oauth_error:
    "GitHub user authorization failed. Restart the connection.",
  github_unavailable: "GitHub is unavailable. Please retry in a moment.",
  installation_denied:
    "This GitHub App installation is not accessible to your account.",
  account_mismatch:
    "Use the same GitHub account that started this workspace, or sign out first.",
  unauthenticated: "Your session expired. Sign in again to resume.",
  repository_denied:
    "Repository access changed. Go back and refresh the repository list.",
  invalid_workspace: "Enter a workspace name between 1 and 60 characters.",
  invalid_repositories: "Select between 1 and 100 accessible repositories.",
  invalid_account: "Enter a valid email address and notification preferences.",
  server_error: "The request could not be saved. Please try again.",
};
export function errorMessage(code: string) {
  return (
    authMessages[code] ?? "Setup could not be completed. Please try again."
  );
}
export async function authFetch<T>(url: string, data?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers:
      data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(errorMessage(result.error));
  return result as T;
}
