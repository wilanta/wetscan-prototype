import type { NextRequest } from "next/server";
import { canvasOverlayRoute } from "../../../../../../features/sentinel/server/canvas-overlay-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return canvasOverlayRoute(request, (await context.params).projectId);
}
