import { g04Route, isG04Resource } from "@/features/guard/g04/http";
import { NextResponse, type NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ projectId: string; resource: string }> };
async function handle(request: NextRequest, context: Ctx) {
  const { projectId, resource } = await context.params;
  if (!isG04Resource(resource)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return g04Route(request, projectId, resource);
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
