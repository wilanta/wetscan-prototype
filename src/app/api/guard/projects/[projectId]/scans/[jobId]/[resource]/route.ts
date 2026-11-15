import { guardRoute } from "@/features/guard/live/http";
import type { NextRequest } from "next/server";
export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ projectId: string; jobId: string; resource: string }>;
  },
) {
  const params = await context.params;
  if (!["findings", "evidence", "coverage"].includes(params.resource))
    return new Response(null, { status: 404 });
  return guardRoute(
    request,
    params.projectId,
    params.resource as "findings" | "evidence" | "coverage",
    params.jobId,
  );
}
