import type { NextRequest } from "next/server";
import { acceptanceRoute } from "@/features/guard/live/acceptance-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return acceptanceRoute(request, (await params).projectId);
}
