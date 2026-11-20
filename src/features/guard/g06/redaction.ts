const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bgh[pousr]_[A-Za-z0-9_]{12,}\b/g, "[REDACTED_GITHUB_TOKEN]"],
  [/\bgithub_pat_[A-Za-z0-9_]{16,}\b/g, "[REDACTED_GITHUB_PAT]"],
  [/\bglpat-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_TOKEN]"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED_TOKEN]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/g, "[REDACTED_JWT]"],
  [
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    "[REDACTED_PRIVATE_KEY]",
  ],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [REDACTED]"],
  [/(https?:\/\/)([^:@\s/]+):([^@\s/]+)@/gi, "$1[REDACTED]:[REDACTED]@"],
  [
    /\b(authorization|proxy-authorization|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|cookie|set-cookie)\s*([:=])\s*([^\s,;'"`]+)/gi,
    "$1$2[REDACTED]",
  ],
];

const SENSITIVE_KEY_RE =
  /^(authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|accessToken|refreshToken|clientSecret|apiKey|x-api-key|privateKey|credential|credentials|headers)$/i;

export function redactG06Text(value: string): string {
  let out = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function redactG06Value<T>(value: T, depth = 0): T {
  if (depth > 16 || value === null || value === undefined) return value;
  if (typeof value === "string") return redactG06Text(value) as T;
  if (Array.isArray(value)) {
    return value.map((item) => redactG06Value(item, depth + 1)) as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactG06Value(entry, depth + 1);
      }
    }
    return out as T;
  }
  return value;
}

export function containsUnredactedSecret(text: string): boolean {
  const withoutPlaceholders = text
    .replace(/(https?:\/\/)\[REDACTED[^\]]*\]:\[REDACTED[^\]]*\]@/gi, "$1")
    .replace(/\b(Bearer|Basic)\s+\[REDACTED[^\]]*\]/gi, "")
    .replace(
      /\b(authorization|proxy-authorization|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|token|cookie|set-cookie)\s*[:=]\s*\[REDACTED[^\]]*\]/gi,
      "",
    )
    .replace(/\[REDACTED(?:_[A-Z0-9_]+)?\]/g, "");
  return SECRET_PATTERNS.some(([pattern]) => {
    pattern.lastIndex = 0;
    return pattern.test(withoutPlaceholders);
  });
}
