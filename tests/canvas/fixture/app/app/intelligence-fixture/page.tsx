import { LiveIntelligence } from "../../../../../../src/features/sentinel/components/live-intelligence";

export default function Page() {
  return (
    <>
      <p role="note">
        Browser fixture only: mocked Intelligence APIs, no authenticated
        PostgreSQL acceptance.
      </p>
      <LiveIntelligence projectId="github-123" />
    </>
  );
}
