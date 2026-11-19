import { NextRequest } from "next/server";
import { guardRoute } from "@/features/guard/live/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return guardRoute(request, (await params).projectId, "repository");
}
