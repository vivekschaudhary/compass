// Move open workflow runs onto their workflow's currently published version.
//
// A run pins the version it started on (`workflow_run.workflow_version_id`), and that pin is
// correct: a gate someone approved must not silently become a different gate. Publishing a new
// version therefore does NOT move runs already in flight — they drain on the old one.
//
// Pre-MVP that leaves a gap nothing covers. sprint-0 v4 bound its criteria to the wrong steps (the
// timeline row asked for the product brief); v5 fixed the seed and published; and the live run kept
// executing v4, showing a Done gate that could never close. Re-importing could not help — the
// importer compares the seed to the PUBLISHED version, and those already matched.
//
// The real answer is an explicit, mapped, validated migration — Camunda's process-instance
// migration is the shape. This is not that. It is the pre-MVP stand-in for one engagement whose
// runs are disposable, and it earns its place by REFUSING rather than guessing:
//
//   - steps are matched by task SLUG, never by ordinal. An ordinal is a position, and renumbering
//     is exactly how v4 broke in the first place.
//   - a run whose steps do not all have a slug counterpart in the target is skipped whole, with
//     the missing slugs named. Restart that run instead.
//   - nothing is written unless --apply is passed.
//
// When a real client's run cannot be restarted, replace this with the mapped migration.
//
//   npx tsx --env-file=.env.local scripts/repoint-runs.mts           # report only
//   npx tsx --env-file=.env.local scripts/repoint-runs.mts --apply   # write

import { supabaseAdmin } from "../app/lib/supabase";
import { planRepoint } from "../app/lib/import/repoint";

const apply = process.argv.includes("--apply");

const sb = supabaseAdmin();
if (!sb) { console.error("Supabase not configured."); process.exit(1); }

const { data: runs, error: runErr } = await sb
  .from("workflow_run")
  .select("id, state, workflow_version_id")
  .neq("state", "closed");
if (runErr) { console.error(runErr.message); process.exit(1); }

if (!runs?.length) { console.log("No open runs."); process.exit(0); }

let moved = 0, already = 0, skipped = 0;

for (const run of runs) {
  const { data: from } = await sb.from("workflow_version")
    .select("id, version, status, workflow_id").eq("id", run.workflow_version_id).maybeSingle();
  if (!from) { console.error(`  ✗ run ${run.id}: its version row is missing — skipped`); skipped++; continue; }

  const { data: wf } = await sb.from("workflow").select("code").eq("id", from.workflow_id).maybeSingle();
  const label = `run ${run.id.slice(0, 8)} (${wf?.code ?? "?"})`;

  const { data: to } = await sb.from("workflow_version")
    .select("id, version").eq("workflow_id", from.workflow_id).eq("status", "published").maybeSingle();
  if (!to) { console.error(`  ✗ ${label}: no published version to move to — skipped`); skipped++; continue; }
  if (to.id === run.workflow_version_id) { console.log(`  · ${label}: already on v${to.version}`); already++; continue; }

  const { data: oldSteps } = await sb.from("workflow_step")
    .select("id, ord, task").eq("workflow_version_id", from.id).order("ord");
  const { data: newSteps } = await sb.from("workflow_step")
    .select("id, ord, task").eq("workflow_version_id", to.id).order("ord");

  const plan = planRepoint(oldSteps ?? [], newSteps ?? []);

  if (!plan.ok) {
    console.error(`  ✗ ${label}: v${from.version} → v${to.version} would strand ${plan.orphans.length} step(s): ${plan.orphans.join(", ")}`);
    console.error("      The graph changed shape. Restart this run rather than moving it.");
    skipped++;
    continue;
  }

  const renumbered = plan.renumbered.map((r) => `${r.task} ${r.from}→${r.to}`);
  console.log(`  → ${label}: v${from.version} → v${to.version}` +
    (renumbered.length ? `  (renumbered: ${renumbered.join(", ")})` : ""));

  // Counted whether or not it is written. A report that says "0 moved" about two runs it just
  // listed as moving is the report arguing with itself.
  moved++;
  if (!apply) continue;

  // Tasks first, then the run. A task pointing at a step from a version its run no longer names is
  // recoverable by re-running this; a run moved while its tasks still point at the old version's
  // steps reads as coherent and is not.
  for (const [oldId, newId] of plan.moves) {
    const { error } = await sb.from("work_task")
      .update({ workflow_step_id: newId })
      .eq("workflow_run_id", run.id).eq("workflow_step_id", oldId);
    if (error) { console.error(`      ✗ ${error.message} — aborting, run NOT moved`); process.exit(1); }
  }

  const { error } = await sb.from("workflow_run")
    .update({ workflow_version_id: to.id }).eq("id", run.id);
  if (error) { console.error(`      ✗ ${error.message}`); process.exit(1); }
}

console.log(
  `\n${runs.length} open run(s): ${moved} ${apply ? "moved" : "to move"} · ${already} already current · ${skipped} skipped` +
  (apply ? "" : "\n\nReport only. Re-run with --apply to write."),
);
