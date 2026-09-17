// Adopt v1's scaffolded doc tree into the `document` table.
//
// A separate, explicit act rather than something the app does on first render. It is a migration,
// it is idempotent, and it should be visible when it happens.
//
//   POST /api/content/adopt?engagementId=<id>

import { ok, refuse, fail } from "@/app/lib/http";
import { adoptV1DocTree } from "@/app/lib/data/documents";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const engagementId = new URL(req.url).searchParams.get("engagementId");
  if (!engagementId) {
    return refuse("engagementId is required.", 400);
  }
  try {
    const result = await adoptV1DocTree(engagementId);
    return ok(result);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "failed");
  }
}
