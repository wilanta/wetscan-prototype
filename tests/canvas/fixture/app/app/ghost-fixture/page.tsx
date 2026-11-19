import { LiveGhost } from "../../../../../../src/features/sentinel/components/live-ghost";

export default function Page() {
  return (
    <>
      <p role="note">
        Browser fixture only: mocked Ghost Lite APIs, no authenticated
        PostgreSQL acceptance.
      </p>
      <LiveGhost projectId="github-123" />
    </>
  );
}
