import { LiveDetection } from "../../../../../../src/features/sentinel/components/live-detection";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  return (
    <>
      <p role="note">
        Browser fixture only: mocked detection APIs, no authenticated PostgreSQL
        acceptance.
      </p>
      <LiveDetection
        projectId="github-123"
        section={
          (await searchParams).section === "alerts" ? "/alerts" : "/rules"
        }
      />
    </>
  );
}
