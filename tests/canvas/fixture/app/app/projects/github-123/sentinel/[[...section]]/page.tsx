// Browser fixture: the real Sentinel dispatcher for a live project, without GitHub auth. API transport is mocked by the spec.
import { Sentinel } from "@/components/views/sentinel";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section = [] } = await params;
  return (
    <Sentinel
      projectId="github-123"
      section={section.length ? "/" + section.join("/") : ""}
    />
  );
}
