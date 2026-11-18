import { LiveIncidents } from "../../../../../../src/features/sentinel/components/live-incidents";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ incidentId?: string }>;
}) {
  return (
    <>
      <p role="note">
        Browser fixture only: mocked incident APIs, no authenticated PostgreSQL
        acceptance.
      </p>
      <LiveIncidents
        projectId="github-123"
        initialIncidentId={(await searchParams).incidentId}
      />
    </>
  );
}
