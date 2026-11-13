export default function Loading() {
  return (
    <div
      className="page loading-skeleton"
      role="status"
      aria-label="Loading workspace"
    >
      <div />
      <div />
      <div />
      <span className="sr-only">Loading your workspace…</span>
    </div>
  );
}
