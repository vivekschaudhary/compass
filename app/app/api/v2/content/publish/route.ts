// Publish documents that were filed before publishing existed.
//
// Compass authored documents into its own tables and published them nowhere, because the
// projection out was never built. This backfills them, and doubles as the retry path for any
// document whose publish failed.

import { NextRequest, NextResponse } from "next/server";
import { publishAll } from "@/app/lib/data/publish";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { engagement } = await req.json();
  if (!engagement) return NextResponse.json({ error: "engagement is required" }, { status: 400 });

  const results = await publishAll(engagement);
  return NextResponse.json({
    published: results.filter((r) => r.ok).length,
    of: results.length,
    results,
  });
}
