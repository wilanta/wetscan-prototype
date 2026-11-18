import { NextRequest } from "next/server";
import { incidentRoute } from "@/features/sentinel/server/incident-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return incidentRoute(request, (await context.params).projectId);
}
export { handle as GET, handle as POST };
