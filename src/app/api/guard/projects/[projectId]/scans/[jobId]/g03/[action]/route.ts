import type { NextRequest } from "next/server";
import { g03Route } from "@/features/guard/g03/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Retest uses the same deferred G02 worker budget as the existing scan resource route.
export const maxDuration = 660;
type Context = {
  params: Promise<{ projectId: string; jobId: string; action: string }>;
};
export async function GET(request: NextRequest, context: Context) {
  return g03Route(request, await context.params);
}
export async function POST(request: NextRequest, context: Context) {
  return g03Route(request, await context.params);
}
