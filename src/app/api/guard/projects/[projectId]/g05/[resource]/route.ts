import type { NextRequest } from "next/server";
import { g05Route } from "@/features/guard/g05/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ projectId: string; resource: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { projectId, resource } = await context.params;
  return g05Route(request, projectId, resource);
}

export async function POST(request: NextRequest, context: Context) {
  const { projectId, resource } = await context.params;
  return g05Route(request, projectId, resource);
}
