import { guardRoute } from "@/features/guard/live/http";
import type { NextRequest } from "next/server";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; jobId: string }> },
) {
  const params = await context.params;
  return guardRoute(request, params.projectId, "cancel", params.jobId);
}
