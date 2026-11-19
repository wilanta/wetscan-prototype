import { LiveNotifications } from "../../../../../../src/features/sentinel/components/live-notifications";
export default function Page() {
  return (
    <>
      <p role="note">
        Browser fixture only: mocked notification APIs, no authenticated PostgreSQL
        acceptance and no provider call.
      </p>
      <LiveNotifications projectId="github-123" />
    </>
  );
}
