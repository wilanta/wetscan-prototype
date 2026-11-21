import { guardRoute } from "@/features/guard/live/http";
import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby with Fluid Compute allows at most 300 seconds per invocation.
export const maxDuration = 300;
export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ projectId: string; jobId: string; resource: string }>;
  },
) {
  const params = await context.params;
  if (
    ![
      "findings",
      "evidence",
      "coverage",
      "view",
      "reports",
      "remediation",
    ].includes(params.resource)
  )
    return new Response(null, { status: 404 });
  return guardRoute(
    request,
    params.projectId,
    params.resource as
      "findings" | "evidence" | "coverage" | "view" | "reports" | "remediation",
    params.jobId,
  );
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{ projectId: string; jobId: string; resource: string }>;
  },
) {
  const p = await context.params;
  if (
    ![
      "triage",
      "reports",
      "product-cancel",
      "resume",
      "retry",
      "remediation",
      "remediation-review",
      "retest-compare",
      "integrations",
    ].includes(p.resource)
  )
    return new Response(null, { status: 404 });
  return guardRoute(
    request,
    p.projectId,
    p.resource as
      | "triage"
      | "reports"
      | "product-cancel"
      | "resume"
      | "retry"
      | "remediation"
      | "remediation-review"
      | "retest-compare"
      | "integrations",
    p.jobId,
  );
}
