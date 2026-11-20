import { NextRequest } from "next/server";
import { handleG06Request } from "@/features/guard/g06/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; resource: string }> },
) {
  const { projectId, resource } = await context.params;
  return handleG06Request(request, projectId, resource);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; resource: string }> },
) {
  const { projectId, resource } = await context.params;
  return handleG06Request(request, projectId, resource);
}
