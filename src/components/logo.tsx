export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <svg
        width="31"
        height="34"
        viewBox="0 0 31 34"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M15.5 1.5 29 7.2v9.6c0 7-5.3 12.4-13.5 15.7C7.3 29.2 2 23.8 2 16.8V7.2L15.5 1.5Z"
          fill="currentColor"
        />
        <path
          d="m8 13 4 9 3.5-7 3.5 7 4-9"
          stroke="white"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <span>
          WetScan<span className="logo-period">.</span>
        </span>
      )}
    </span>
  );
}
