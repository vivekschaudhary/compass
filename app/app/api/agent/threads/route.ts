import { supabaseAdmin } from "@/app/lib/supabase";
import { listThreads } from "@/app/lib/agent-thread";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Thread list for the dock — the conversations owned by (engagement, role), newest first.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const engagementId = url.searchParams.get("engagementId") ?? "";
  const role = url.searchParams.get("role") ?? "";
  const sb = supabaseAdmin();
  if (!sb || !engagementId || !role) return Response.json({ threads: [] });
  const threads = await listThreads(sb, engagementId, role);
  return Response.json({ threads });
}
