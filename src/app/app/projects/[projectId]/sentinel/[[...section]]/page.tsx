import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Sentinel } from "@/components/views/sentinel";
import {
  canvasIdentity,
  workspaceScope,
} from "@/features/canvas/server/github-reader";
import { authorizeSentinelProject } from "@/features/sentinel/server/project-context";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/config";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string; section?: string[] }>;
}) {
  const { projectId, section = [] } = await params;
  // The original catch-all remains authoritative for Orderly Demo and every other module.
  if (projectId === "orderly-demo") {
    if (
      section.length === 0 ||
      ["activity", "incidents", "responses"].includes(section.join("/"))
    )
      return (
        <Sentinel section={section.length ? "/" + section.join("/") : ""} />
      );
    // Other original demo subroutes keep their original components via the preserved dispatcher.
    const Original = (await import("@/app/app/[...path]/page")).default;
    return (
      <Original
        params={Promise.resolve({
          path: ["projects", projectId, "sentinel", ...section],
        })}
        searchParams={Promise.resolve({})}
      />
    );
  }
  if (
    !/^github-[1-9]\d{0,15}$/.test(projectId) ||
    section.length > 2 ||
    (section.length === 1 &&
      ![
        "activity",
        "sources",
        "rules",
        "alerts",
        "incidents",
        "responses",
        "notifications",
      ].includes(section[0])) ||
    (section.length === 2 &&
      (section[0] !== "incidents" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
          section[1],
        )))
  )
    notFound();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  try {
    const { profile } = await canvasIdentity(token);
    await authorizeSentinelProject(token, {
      mode: "live",
      workspaceId: workspaceScope(profile),
      projectId,
    });
  } catch (error) {
    if (error instanceof AuthError && error.code === "unauthenticated")
      redirect("/login");
    if (error instanceof AuthError && error.code === "onboarding_incomplete")
      redirect("/onboarding");
    if (
      error instanceof AuthError &&
      (error.status === 403 || error.status === 404)
    )
      notFound();
    return (
      <div className="page">
        <h1>Telemetry authorization unavailable</h1>
        <p>
          Reconnect your GitHub account or retry when repository access can be
          verified. No telemetry is shown.
        </p>
      </div>
    );
  }
  return (
    <Sentinel
      projectId={projectId}
      section={section.length ? "/" + section.join("/") : ""}
    />
  );
}
