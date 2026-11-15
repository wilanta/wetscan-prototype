import { NextRequest } from "next/server";
import { detectionRoute } from "@/features/sentinel/server/detection-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return detectionRoute(request, (await context.params).projectId, "rules");
}
export { handle as GET, handle as POST };
