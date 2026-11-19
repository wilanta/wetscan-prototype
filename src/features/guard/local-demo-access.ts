/** Demo data only: this gate never grants access to a real project or runner. */
export function localDemoAllowed(
  environment: string | undefined,
  enabled: string | undefined,
  host: string | null,
): boolean {
  if (
    !["development", "test"].includes(environment ?? "") ||
    enabled !== "1" ||
    !host
  )
    return false;
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(host);
}
