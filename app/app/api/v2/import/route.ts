// Import workspace configuration from CSVs.
//
// GET  ?dry=1   plan only — what would change, and why
// POST          plan, then apply
//
// With no body it loads `compass/seed/*.csv` from the framework. That is deliberate: the demo
// engagement is seeded through the same path a user's upload takes, so the importer is exercised
// from day one rather than being a feature nobody runs until a client needs it. Resetting the
// demo is re-running the load.

import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { supabaseAdmin } from "@/app/lib/supabase";
import { COMPASS_DIR } from "@/app/lib/specs";
import { planImport, type Bundle } from "@/app/lib/import/plan";
import { applyPlan, describeReport } from "@/app/lib/import/apply";
import { supabaseConfigStore, readExisting } from "@/app/lib/import/store";

export const dynamic = "force-dynamic";

const SEED_FILES: Record<keyof Bundle, string> = {
  workstreams: "workstreams.csv",
  roles: "roles.csv",
  workflows: "workflows.csv",
  steps: "workflow-steps.csv",
  criteria: "criteria.csv",
};

function seedBundle(): Bundle {
  const dir = join(COMPASS_DIR, "seed");
  const bundle: Bundle = {};
  for (const [key, file] of Object.entries(SEED_FILES) as [keyof Bundle, string][]) {
    const path = join(dir, file);
    if (existsSync(path)) bundle[key] = readFileSync(path, "utf-8");
  }
  return bundle;
}

async function run(bundle: Bundle, orgCode: string, engagementId: string | null, dry: boolean) {
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });

  const existing = await readExisting(sb, orgCode, engagementId);
  const planned = planImport(bundle, existing);

  // Refusals are the useful output, not an error page: each one names the file, the row and the
  // one next move.
  if (!planned.ok) {
    return NextResponse.json({ ok: false, problems: planned.problems }, { status: 422 });
  }

  if (dry) {
    return NextResponse.json({
      ok: true, dryRun: true, summary: planned.summary,
      workflows: planned.plan.workflows.map((w) => ({ code: w.row.code, action: w.action, changes: w.changes })),
    });
  }

  const report = await applyPlan(planned.plan, { orgCode, engagementId }, supabaseConfigStore(sb));
  return NextResponse.json({ ok: true, summary: describeReport(report), report });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return run(
    seedBundle(),
    url.searchParams.get("org") ?? "default",
    url.searchParams.get("engagementId") || null,
    url.searchParams.get("dry") !== "0",     // GET defaults to a dry run — reading should not write
  );
}

export async function POST(req: Request) {
  let body: { bundle?: Bundle; org?: string; engagementId?: string | null; dry?: boolean } = {};
  try { body = await req.json(); } catch { /* no body — seed from the framework */ }

  return run(
    body.bundle && Object.keys(body.bundle).length ? body.bundle : seedBundle(),
    body.org ?? "default",
    body.engagementId ?? null,
    body.dry === true,
  );
}
