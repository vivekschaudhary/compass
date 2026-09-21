// Delete ONE workflow run and the rows inside it.
//
//   node --experimental-strip-types --env-file=.env.local scripts/drop-run.mts <runId>
//   node --experimental-strip-types --env-file=.env.local scripts/drop-run.mts <runId> --apply
//
// Without `--apply` it reports and writes nothing, like `reset-engagement.mts` and for the same
// reason: the useful output of a destructive tool is the list of what it would destroy.
//
// WHY A RUN CAN NEED DELETING. `phasesFor` reads state from TOP-LEVEL runs only, so a workflow that
// some other workflow's row already had open still read "available" in the workflow list. Starting
// it there opened a SECOND run with no parent task — rows and Jira tickets for a deliverable
// another run was already producing, which nothing could ever close, because the parent row's gate
// counts only runs opened under it. The list no longer offers that (see `nestedByOpenRun`); this
// clears up the one that got made.
//
// REFUSES TO DELETE WORK. A run holding a task that is closed, or that produced a document version,
// is not a stray — it is history, and deleting it would remove the record of something that
// happened. Such a run is reported and left alone. The intended target is a duplicate that never
// ran: idle rows, nothing produced.
//
// CLEARS COMPASS'S SIDE ONLY. The Jira issues for those rows stay where they are — they are named
// in the report so deleting them is a decision someone makes, not a surprise.

import { supabaseAdmin } from "../app/lib/supabase.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const runId = args.find((a) => !a.startsWith("--")) ?? null;

const sb = supabaseAdmin();
if (!sb) { console.error("Supabase is not configured. Check .env.local."); process.exit(1); }

if (!runId) {
  console.error("✗ Name the run to delete: drop-run.mts <runId> [--apply]");
  process.exit(1);
}

const die = (what: string, error: { message: string } | null) => {
  if (error) { console.error(`✗ ${what}: ${error.message}`); process.exit(1); }
};

/* ── what is there ────────────────────────────────────────────────────────── */

const { data: run, error: runErr } = await sb
  .from("workflow_run")
  .select("id, engagement_id, state, opened_at, parent_task_id, ticket_key, workflow_version_id")
  .eq("id", runId)
  .maybeSingle();
die("read run", runErr);

if (!run) {
  // Refused, not reported as a successful no-op. "Nothing to delete" and "that id does not exist"
  // look identical in a report of zeroes, and the likeliest cause is a mistyped id.
  console.error(`✗ No run '${runId}'.`);
  process.exit(1);
}

const { data: version } = await sb
  .from("workflow_version")
  .select("workflow(code)")
  .eq("id", run.workflow_version_id)
  .maybeSingle();
const code =
  (version as { workflow?: { code?: string } } | null)?.workflow?.code ?? "?";

const { data: tasks, error: taskErr } = await sb
  .from("work_task")
  .select("id, title, state, ticket_key, role_code")
  .eq("workflow_run_id", run.id);
die("read tasks", taskErr);

const rows = tasks ?? [];

console.log(`\nrun ${run.id}`);
console.log(`  workflow      ${code}`);
console.log(`  opened        ${run.opened_at}`);
console.log(`  state         ${run.state}`);
console.log(`  parent task   ${run.parent_task_id ?? "none — top-level"}`);
console.log(`  run ticket    ${run.ticket_key ?? "none"}`);
console.log(`  rows          ${rows.length}`);
for (const t of rows) {
  console.log(`      ${t.state.padEnd(8)} ${(t.ticket_key ?? "-").padEnd(8)} ${t.title}  (${t.role_code})`);
}

/* ── the refusals ─────────────────────────────────────────────────────────── */

const refusals: string[] = [];

const finished = rows.filter((t) => t.state === "closed" || t.state === "abandoned");
if (finished.length) {
  refusals.push(
    `${finished.length} row(s) are already closed — ${finished.map((t) => t.ticket_key ?? t.id).join(", ")}. ` +
    `That is work that happened, not a stray run.`,
  );
}

// A run whose rows authored anything is history too. Checked through `turn` and `document_version`
// rather than assumed from state: a row can produce a draft and still be open.
//
// EVERY COUNT IS CHECKED FOR AN ERROR. The first version of this asked `document_version` for
// `task_id`, which does not exist — the column is `created_by_task_id`. PostgREST answered with an
// error carrying an empty message and a null count, and `if (versions)` was false, so the guard
// passed. A check that cannot run looks exactly like a check that found nothing, and this one
// stands between a mistyped id and deleting a published deliverable.
const ids = rows.map((t) => t.id);

const countOf = async (table: string, column: string): Promise<number> => {
  const { count, error } = await sb
    .from(table).select("id", { count: "exact", head: true }).in(column, ids);
  if (error || count === null) {
    console.error(
      `✗ Could not count ${table} for these rows: ${error?.message || "no count returned"}. ` +
      `Refusing to delete anything on an unchecked guard.`,
    );
    process.exit(1);
  }
  return count;
};

if (ids.length) {
  const turns = await countOf("turn", "task_id");
  if (turns) refusals.push(`${turns} agent turn(s) were recorded against these rows.`);

  const versions = await countOf("document_version", "created_by_task_id");
  if (versions) refusals.push(`${versions} document version(s) were filed by these rows.`);
}

if (refusals.length) {
  console.log("\n✗ Refusing to delete this run:");
  for (const r of refusals) console.log(`    ${r}`);
  console.log("\n  Nothing was written.\n");
  process.exit(1);
}

/* ── delete ───────────────────────────────────────────────────────────────── */

// The RUN's own ticket counts too — it is the epic the rows hang under, and a report that named
// only the row tickets would leave one orphan on the board that nobody had been told about.
const strandedTickets = [
  run.ticket_key as string | null,
  ...rows.map((t) => t.ticket_key as string | null),
].filter(Boolean) as string[];

if (!apply) {
  console.log(`\n[dry-run] would delete ${rows.length} row(s) and the run itself.`);
  if (strandedTickets.length) {
    console.log(
      `           Jira keeps ${strandedTickets.join(", ")} — delete them on the board yourself.`,
    );
  }
  console.log("           Re-run with --apply to perform it.\n");
  process.exit(0);
}

// Tasks first: `workflow_run` is referenced by `work_task.workflow_run_id`, and the rows carry the
// cascades (task_input, measurement, turn, question) — the same order `planReset` uses.
if (ids.length) {
  const { error } = await sb.from("work_task").delete().in("id", ids);
  die("delete tasks", error);
}
const { error: delRun } = await sb.from("workflow_run").delete().eq("id", run.id);
die("delete run", delRun);

/* ── assert the effect ────────────────────────────────────────────────────── */

const { data: still } = await sb
  .from("workflow_run").select("id").eq("id", run.id).maybeSingle();
if (still) {
  console.error("\n✗ The run is still there. Nothing to trust in this report — investigate.\n");
  process.exit(1);
}
const { count: leftover } = await sb
  .from("work_task").select("id", { count: "exact", head: true }).eq("workflow_run_id", run.id);

console.log(`\n✓ Deleted the run and ${ids.length} row(s). Rows still pointing at it: ${leftover ?? 0}.`);
if (strandedTickets.length) {
  console.log(`  Jira still holds ${strandedTickets.join(", ")} — delete them on the board.\n`);
}
