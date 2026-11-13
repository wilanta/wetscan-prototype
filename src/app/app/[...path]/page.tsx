import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Canvas } from "@/components/views/canvas";
import {
  FindingDetail,
  Guard,
  Integrity,
  Remediation,
} from "@/components/views/guard";
import {
  Ghost,
  IncidentDetail,
  Intelligence,
  Sentinel,
} from "@/components/views/sentinel";
import {
  Integrations,
  Notifications,
  Reports,
  Settings,
} from "@/components/views/manage";
import { Projects, WorkspaceActivity } from "@/components/views/projects";
export default async function Page({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  const route = path.join("/");
  if (route === "projects") return <Projects />;
  if (route === "activity") return <WorkspaceActivity />;
  if (route === "notifications") return <Notifications />;
  if (route === "integrations") return <Integrations />;
  if (route === "reports") return <Reports />;
  if (route === "settings") return <Settings />;
  if (path[0] !== "projects" || path[1] !== "orderly-demo") notFound();
  const rest = path.slice(2).join("/");
  if (!rest) return <Projects hub />;
  if (rest === "canvas")
    return (
      <Suspense fallback={<p>Preparing your application map…</p>}>
        <Canvas />
      </Suspense>
    );
  if (
    ["guard", "guard/scans", "guard/findings", "guard/releases"].includes(rest)
  )
    return <Guard section={rest.replace("guard", "")} />;
  if (/^guard\/findings\/FIND-10[234]$/.test(rest))
    return <FindingDetail id={path.at(-1)} />;
  if (rest === "guard/integrity") return <Integrity />;
  if (rest === "guard/remediation") return <Remediation />;
  if (
    [
      "sentinel",
      "sentinel/activity",
      "sentinel/incidents",
      "sentinel/responses",
    ].includes(rest)
  )
    return <Sentinel section={rest.replace("sentinel", "")} />;
  if (/^sentinel\/incidents\/INC-\d+$/.test(rest))
    return <IncidentDetail id={path.at(-1)!} />;
  if (rest === "sentinel/ghost") return <Ghost />;
  if (rest === "sentinel/intelligence") return <Intelligence />;
  notFound();
}
