import { LiveTelemetry } from "../../../../../../src/features/sentinel/components/live-telemetry";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  return (
    <>
      <p role="note">
        Browser fixture only: mocked telemetry transport, no GitHub
        authorization or PostgreSQL evidence.
      </p>
      <LiveTelemetry
        projectId="github-123"
        section={(await searchParams).section === "sources" ? "/sources" : ""}
      />
    </>
  );
}
