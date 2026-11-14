import "server-only";
import { AuthError } from "@/lib/auth/config";

/** Fixed origin, bounded response streaming and one shared snapshot deadline. */
export async function sourceRequest<T>(
  path: string,
  token: string,
  signal: AbortSignal,
  maxBytes = 1_000_000,
  body?: unknown,
): Promise<T> {
  try {
    const response = await fetch("https://api.github.com" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get("x-ratelimit-remaining") === "0" ||
            response.headers.has("retry-after")))
      )
        throw new AuthError("github_rate_limited", 429);
      if ([401, 403, 404].includes(response.status))
        throw new AuthError("repository_denied", 403);
      if ([409, 422].includes(response.status))
        throw new AuthError("revision_unavailable", 409);
      throw new AuthError("github_unavailable", 502);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new AuthError("github_response", 502);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new AuthError("source_response_limit", 413);
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(
      signal.aborted ? "source_timeout" : "github_unavailable",
      502,
    );
  }
}

export async function revokeSourceToken(token: string) {
  await fetch("https://api.github.com/installation/token", {
    method: "DELETE",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined);
}
