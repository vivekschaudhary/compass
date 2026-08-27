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
import { COMPASS_DIR } from "@/app/lib/specs";
import { planImport, type Bundle } from "@/app/lib/import/plan";
import { applyPlan, describeReport } from "@/app/lib/import/apply";
import { configStore, readExistingFor, countStaleRuns } from "@/app/lib/import/store";

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
  const existing = await readExistingFor(orgCode, engagementId);
  if (!existing) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });

  const planned = planImport(bundle, existing);

  // Refusals are the useful output, not an error page: each one names the file, the row and the
  // one next move.
  if (!planned.ok) {
    return NextResponse.json({ ok: false, problems: planned.problems }, { status: 422 });
  }

  // Runs already in flight are pinned to the version they started on and do NOT move when a new
  // one publishes — correctly, since a gate someone approved must not silently become a different
  // gate. But that made a fix look applied when it was not: sprint-0 v5 corrected criteria that had
  // slid onto the wrong rows, the import reported "unchanged" (it compares the seed to the
  // PUBLISHED version, and those matched), and the live board kept executing v4 with a Done gate
  // that could never close. Nothing said so.
  //
  // So the count is in the response whether or not anything changed. It does not act — moving a run
  // is `scripts/repoint-runs.mts`, and a real migration when runs stop being disposable.
  if (dry) {
    return NextResponse.json({
      ok: true, dryRun: true, summary: planned.summary,
      workflows: planned.plan.workflows.map((w) => ({ code: w.row.code, action: w.action, changes: w.changes })),
      // The one part of a plan that TAKES something away, so it is in the preview or the preview is
      // not a preview. A typo'd `code` column looks exactly like a deliberate retirement, and only
      // the person who wrote the CSV can tell the difference — from this list, before applying.
      retire: planned.plan.retire,
      openRunsOnSupersededVersions: await countStaleRuns(),
    });
  }

  const store = configStore();
  if (!store) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });

  const report = await applyPlan(planned.plan, { orgCode, engagementId }, store);
  // Counted AFTER applying: publishing a new version is exactly what strands open runs, so the
  // number that matters is the one this import just created.
  return NextResponse.json({
    ok: true, summary: describeReport(report), report,
    openRunsOnSupersededVersions: await countStaleRuns(),
  });
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
