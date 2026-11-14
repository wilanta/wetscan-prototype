export const limits = {
  maxFiles: 1200,
  maxFileBytes: 256_000,
  maxTotalBytes: 8_000_000,
  maxDepth: 16,
  maxMs: 8000,
};
export type DiscoveryLimits = typeof limits;
const ignored =
  /^(node_modules|\.next|dist|build|\.git|coverage|vendor|generated|\.auth|sessions?|credentials?)$/i;
export function safePath(path: string): boolean {
  if (
    !path ||
    path.length > 512 ||
    /[\\\x00-\x1f:%?#]/.test(path) ||
    path.startsWith("/") ||
    path.includes("//")
  )
    return false;
  const parts = path.split("/");
  if (parts.some((p) => p === ".." || p === "." || ignored.test(p)))
    return false;
  const name = parts.at(-1)!;
  if (/^\.env/i.test(name)) return name === ".env.example";
  if (
    /\.(pem|key|p12|pfx|crt|sqlite|db|lockb)$/i.test(name) ||
    /(?:^|[-_.])(secrets?|credentials?|tokens?)(?:[-_.]|$)/i.test(name)
  )
    return false;
  if (
    /(?:^|[-_.])sessions?(?:[-_.]|$)/i.test(name) &&
    !/\.[cm]?[jt]sx?$/.test(name)
  )
    return false;
  return (
    !/\.min\.[cm]?js$/.test(name) &&
    (/\.(?:[cm]?[jt]sx?|json|ya?ml|prisma|toml)$/i.test(name) ||
      /^(Dockerfile|\.env.example|(?:pnpm|yarn|bun)\.lock)$/.test(name))
  );
}
export function redactEnvironmentNames(text: string): string {
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=/.exec(line);
      return m ? [`${m[1]}=[redacted]`] : [];
    })
    .join("\n");
}
/** Export only summaries, never snippets. Also scrub common accidentally pasted credential values. */
export function redactText(text: string): string {
  return text
    .replace(/-----BEGIN[\s\S]*?-----END[^\n]*-----/g, "[redacted key]")
    .replace(
      /\b(?:gh[pousr]_[\w]+|github_pat_[\w]+|sk_(?:live|test)_[\w]+|Bearer\s+\S+)\b/gi,
      "[redacted]",
    )
    .replace(
      /\b(?:token|password|secret|api[_-]?key)\s*[:=]\s*["']?[^\s,"';]+/gi,
      "credential=[redacted]",
    )
    .replace(/(\w+:\/\/)[^/@\s]+:[^/@\s]+@/g, "$1[redacted]@");
}
