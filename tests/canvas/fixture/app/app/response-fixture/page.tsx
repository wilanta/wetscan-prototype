import { LiveResponses } from "../../../../../../src/features/sentinel/components/live-responses";
export default function Page() {
  return (
    <>
      <p role="note">
        Browser fixture only: mocked response APIs, no authenticated PostgreSQL
        acceptance.
      </p>
      <LiveResponses projectId="github-123" />
    </>
  );
}
