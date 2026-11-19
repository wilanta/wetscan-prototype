import { NextRequest } from "next/server";
import { notificationRoute } from "@/features/sentinel/server/notification-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return notificationRoute(request, (await context.params).projectId);
}
export { handle as GET, handle as POST };
