import type { NextRequest } from "next/server";
import { externalRoute } from "../../../../../../features/sentinel/server/external-http";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return externalRoute(request, (await context.params).projectId);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return externalRoute(request, (await context.params).projectId);
}
