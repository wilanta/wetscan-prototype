import { webhookHandler } from "@/features/guard/g04/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return webhookHandler(request);
}
