import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/config";
import { authorizeGuardProject } from "@/features/guard/live/project";
import { LiveGuardWorkspace } from "@/features/guard/live/live-workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; section?: string[] }>;
  searchParams: Promise<{ scan?: string }>;
}) {
  const { projectId, section = [] } = await params;
  if (projectId === "orderly-demo") {
    const Original = (await import("@/app/app/[...path]/page")).default;
    return (
      <Original
        params={Promise.resolve({
          path: ["projects", projectId, "guard", ...section],
        })}
        searchParams={Promise.resolve({})}
      />
    );
  }
  if (
    !/^github-[1-9]\d{0,15}$/.test(projectId) ||
    section.length > 1 ||
    !["", "scans", "findings", "integrity", "remediation", "releases"].includes(
      section.join("/"),
    )
  )
    notFound();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  let authority: Awaited<ReturnType<typeof authorizeGuardProject>>;
  try {
    authority = await authorizeGuardProject(token, projectId);
  } catch (error) {
    if (error instanceof AuthError && error.code === "unauthenticated")
      redirect("/login");
    if (error instanceof AuthError && error.code === "onboarding_incomplete")
      redirect("/onboarding");
    if (error instanceof AuthError && [403, 404].includes(error.status))
      notFound();
    return (
      <div className="page">
        <h1>Repository authorization unavailable</h1>
        <p>
          Retry after GitHub access can be verified. No source snapshot or job
          was prepared.
        </p>
      </div>
    );
  }
  return (
    <LiveGuardWorkspace
      projectId={projectId}
      repositoryName={authority.repositoryName}
      branch={authority.branch}
      section={section.join("/")}
      initialScanId={(await searchParams).scan}
    />
  );
}
