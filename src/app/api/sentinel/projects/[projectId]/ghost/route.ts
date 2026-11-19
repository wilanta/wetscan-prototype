import type { NextRequest } from "next/server";
import { ghostRoute } from "../../../../../../features/sentinel/server/ghost-http";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return ghostRoute(request, (await context.params).projectId);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return ghostRoute(request, (await context.params).projectId);
}
