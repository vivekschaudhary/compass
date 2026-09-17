// Publish documents that were filed before publishing existed.
//
// Compass authored documents into its own tables and published them nowhere, because the
// projection out was never built. This backfills them, and doubles as the retry path for any
// document whose publish failed.

import { NextRequest } from "next/server";
import { publishAll } from "@/app/lib/data/publish";
import { ok, refuse } from "@/app/lib/http";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { engagement } = await req.json();
  if (!engagement) return refuse("engagement is required", 400);

  const results = await publishAll(engagement);
  // `ok: true` even when some documents failed: the backfill ran, and `results` says which did not.
  return ok({
    published: results.filter((r) => r.ok).length,
    of: results.length,
    results,
  });
}
