import { NextRequest } from "next/server";
import { responseRoute } from "@/features/sentinel/server/response-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return responseRoute(request, (await context.params).projectId);
}
export { handle as GET, handle as POST };
