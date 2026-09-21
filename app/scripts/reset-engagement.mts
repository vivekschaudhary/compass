// Clear an engagement's work, keeping the engagement.
//
//   node --experimental-strip-types --env-file=.env.local scripts/reset-engagement.mts
//   node --experimental-strip-types --env-file=.env.local scripts/reset-engagement.mts <engagement>
//   node --experimental-strip-types --env-file=.env.local scripts/reset-engagement.mts <engagement> --apply
//
// With no id it reports on EVERY engagement. `--apply` is what writes; without it nothing is
// touched, exactly as `repoint-runs.mts` behaves, and for the same reason — the useful output of a
// destructive tool is the list of what it would destroy.
//
// WHY THIS EXISTS AND WHEN TO RUN IT: see `app/lib/data/reset.ts`. The short version is that it runs
// BEFORE an import that shrinks a workflow, never after, because `syncSteps` cannot delete a step a
// live task still points at and `applyPlan` has no transaction to roll back when it fails.
//
// It clears COMPASS'S SIDE ONLY. Pages already published to Confluence or Teams, and issues already
// created in Jira, stay where they are — the report says how many, so that is a decision rather
// than a surprise.

import { supabaseAdmin } from "../app/lib/supabase.ts";
import { planReset, describeReset, type ResetSnapshot } from "../app/lib/data/reset.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args.find((a) => !a.startsWith("--")) ?? null;

const sb = supabaseAdmin();
if (!sb) { console.error("Supabase is not configured. Check .env.local."); process.exit(1); }

const die = (what: string, error: { message: string } | null) => {
  if (error) { console.error(`✗ ${what}: ${error.message}`); process.exit(1); }
};

/* ── which engagements ────────────────────────────────────────────────────── */

const { data: engagements, error: engErr } = await sb.from("engagement").select("id, name");
die("read engagements", engErr);

const targets = only ? (engagements ?? []).filter((e) => e.id === only) : (engagements ?? []);

if (only && !targets.length) {
  console.error(`✗ No engagement '${only}'. Known: ${(engagements ?? []).map((e) => e.id).join(", ") || "none"}`);
  process.exit(1);
}
if (!targets.length) { console.log("No engagements."); process.exit(0); }

/* ── report, then optionally write ────────────────────────────────────────── */

// Deletes go in chunks: PostgREST puts `in.(…)` in the URL, and a few thousand uuids exceeds what
// the server will accept. Failing at 8k characters rather than at a row count is the kind of limit
// that shows up only on the one engagement big enough to hit it.
const CHUNK = 200;
const chunked = async (table: string, ids: string[]) => {
  for (let i = 0; i < ids.length; i += CHUNK) {
    die(`delete ${table}`, (await sb.from(table).delete().in("id", ids.slice(i, i + CHUNK))).error);
  }
};

let refused = 0, cleared = 0;

for (const eng of targets) {
  const id = eng.id as string;

  const [tasks, runs, documents, events] = await Promise.all([
    sb.from("work_task").select("id, workflow_run_id").eq("engagement_id", id),
    sb.from("workflow_run").select("id").eq("engagement_id", id),
    sb.from("document").select("id, path, external_url").eq("engagement_id", id),
    sb.from("event").select("id, verb").eq("engagement_id", id),
  ]);
  die("read work_task", tasks.error);
  die("read workflow_run", runs.error);
  die("read document", documents.error);
  die("read event", events.error);

  const snap: ResetSnapshot = {
    engagementId: id,
    tasks: (tasks.data ?? []).map((t) => ({ id: t.id as string, workflowRunId: t.workflow_run_id as string | null })),
    runs: (runs.data ?? []).map((r) => ({ id: r.id as string })),
    documents: (documents.data ?? []).map((d) => ({
      id: d.id as string, path: d.path as string, externalUrl: d.external_url as string | null,
    })),
    events: (events.data ?? []).map((e) => ({ id: e.id as string, verb: e.verb as string })),
  };

  const planned = planReset(snap);
  console.log(`\n${id}  —  ${eng.name ?? ""}`);

  if (!planned.ok) {
    for (const r of planned.refusals) console.log(`  · ${r.message}\n    → ${r.fix}`);
    refused++;
    continue;
  }

  for (const line of describeReset(planned.plan)) console.log(line);
  if (planned.plan.publishedElsewhere > 0) {
    console.log(
      `\n  NOTE  ${planned.plan.publishedElsewhere} document(s) are published to the doc store. ` +
      `Those pages are NOT deleted — this clears Compass's side only.`,
    );
  }

  if (!apply) { cleared++; continue; }

  // `document.current_version_id` references `document_version` with no `on delete` rule. Nulling
  // it first makes the cascade unambiguous instead of depending on how Postgres orders a delete
  // that takes the parent and the row it points at in one statement.
  const docIds = planned.plan.deletes.find((d) => d.table === "document")!.ids;
  for (let i = 0; i < docIds.length; i += CHUNK) {
    die("clear current_version_id", (await sb.from("document")
      .update({ current_version_id: null }).in("id", docIds.slice(i, i + CHUNK))).error);
  }

  // In the planned order. No transaction is available through PostgREST, so this is re-runnable
  // rather than atomic: every step is a delete by id, so running it twice removes nothing extra.
  for (const d of planned.plan.deletes) {
    await chunked(d.table, d.ids);
  }
  cleared++;
  console.log("  ✓ cleared");
}

console.log(
  `\n${targets.length} engagement(s): ${cleared} ${apply ? "cleared" : "to clear"}` +
  (refused ? ` · ${refused} refused` : "") +
  (apply ? "" : "\n\nReport only. Re-run with --apply to write."),
);
