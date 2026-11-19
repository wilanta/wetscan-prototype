import type { NextRequest } from "next/server";
import { intelligenceRoute } from "../../../../../../features/sentinel/server/intelligence-http";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return intelligenceRoute(request, (await context.params).projectId);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return intelligenceRoute(request, (await context.params).projectId);
}
