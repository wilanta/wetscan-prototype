import { guardRoute } from "@/features/guard/live/http";
import type { NextRequest } from "next/server";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; jobId: string }> },
) {
  const params = await context.params;
  return guardRoute(request, params.projectId, "status", params.jobId);
}
