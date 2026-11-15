import type { NextRequest } from "next/server";
import { guardRoute } from "@/features/guard/live/http";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return guardRoute(
    request,
    (await context.params).projectId,
    "source-acceptance",
  );
}
