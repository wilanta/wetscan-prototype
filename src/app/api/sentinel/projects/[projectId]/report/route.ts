import type { NextRequest } from "next/server";
import { reportRoute } from "../../../../../../features/sentinel/server/report-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return reportRoute(request, (await context.params).projectId);
}
