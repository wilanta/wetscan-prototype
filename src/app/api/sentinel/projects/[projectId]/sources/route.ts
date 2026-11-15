import type { NextRequest } from "next/server";
import { controlRoute } from "@/features/sentinel/server/telemetry-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return controlRoute(request, (await context.params).projectId, "sources");
}
export const GET = handle;
export const POST = handle;
