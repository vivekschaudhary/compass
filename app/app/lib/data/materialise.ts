// Turning an approved document into state.
//
// An agent produces a document; the document names things the app must know — who holds a role, what
// the epics are. Until something reads it, the page and the page's subject disagree: the roster
// listed nine people and `member` had one row, so the site showed one name and the delivery manager
// reasonably concluded the app had lost them.
//
// A REGISTRY, not a special case. Every document that must become state registers against the path
// it is produced at, and `materialiseFrom` runs whatever is registered when the producing task
// closes. The next one plugs in; it does not add another branch to `approve`.
//
// Three rules, learned from doing this wrong with the kickoff backlog:
//
//   Only on approval. A draft is a proposal. Materialising it before a human accepts it would let an
//   agent staff an engagement by suggesting names.
//
//   Idempotent. Re-approving, a retry, a replayed event: none may duplicate.
//
//   Never fatal, and never silent. A parse that finds nothing is REPORTED — the document said
//   something and the app failed to read it, which is exactly the case that must not pass quietly.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { holdersOn, type Actor } from "./actor";
import { emit } from "./events";
import { parseRoster } from "./roster-rows";
import { parseCommitments } from "./sprint-rows";
import { backlogOf } from "./backlog";
import { mirrorBacklog, mirrorSprint } from "./tracker";
import { destinationOf, resolvePath } from "../adapters";
import { subjectOfRun } from "../agent/context";

export type Materialised = { path: string; created: number; updated: number; problems: string[] };

const initialsOf = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * `01-foundation/team` → `member` rows.
 *
 * Role LABELS are matched against the catalogue rather than hardcoded, because the agent writes
 * "Principal Engineer" and the app stores `principal-engineer`, and a hardcoded map would drift
 * from the roles the moment one is added.
 */
async function materialiseRoster(actor: Actor, markdown: string): Promise<Materialised> {
  const out: Materialised = { path: "01-foundation/team", created: 0, updated: 0, problems: [] };
  const sb = supabaseAdmin();
  if (!sb) return { ...out, problems: ["Supabase is not configured."] };

  const rows = parseRoster(markdown);
  if (!rows.length) {
    return { ...out, problems: ["The roster has no table with Role and Holder columns — nobody was staffed."] };
  }

  const { data: roles } = await sb.from("role").select("code, label, title").eq("org_id", actor.orgId);
  const byLabel = new Map((roles ?? []).map((r) => [String(r.label).toLowerCase(), r]));
  const byCode = new Map((roles ?? []).map((r) => [String(r.code).toLowerCase(), r]));

  // Org-level holders count as already staffed. Without this an approved roster naming the PMO
  // Analyst would insert a SECOND row for the same person on this engagement — the org default plus
  // a copy — and every read that resolves precedence would then quietly prefer the copy.
  const existing = await holdersOn(actor.engagementId);
  const already = new Map(existing.map((m) => [`${m.role}::${String(m.name).toLowerCase()}`, m]));

  let ord = existing.length;
  for (const row of rows) {
    if (!row.holder) continue;                       // a recorded vacancy is not a person

    const role = byLabel.get(row.roleLabel.toLowerCase()) ?? byCode.get(row.roleLabel.toLowerCase());
    if (!role) {
      // Named rather than dropped: a role the catalogue does not have is a real finding about the
      // roster, and staffing somebody into nothing would be worse than saying so.
      out.problems.push(`"${row.roleLabel}" (${row.holder}) is not a role in the catalogue — not staffed.`);
      continue;
    }

    if (already.has(`${role.code}::${row.holder.toLowerCase()}`)) { out.updated += 1; continue; }

    const { error } = await sb.from("member").insert({
      // Distinct per person: three engineers must not collide on `<engagement>-<role>`, which is
      // what the delivery manager's own row uses.
      id: `${actor.engagementId}-${role.code}-${slug(row.holder)}`,
      // 056 made this NOT NULL and this insert never set it, so EVERY row here was rejected — an
      // approved roster staffed nobody, and the failure went into `problems`, which the caller
      // discarded. The gate closed green on an engagement with an empty `member` table.
      org_id: actor.orgId,
      engagement_id: actor.engagementId, role: role.code,
      name: row.holder, title: role.title ?? role.label,
      initials: initialsOf(row.holder), ord: ord++,
    });
    if (error) out.problems.push(`${row.holder} (${role.code}): ${error.message}`);
    else out.created += 1;
  }

  return out;
}

/**
 * `02-scope/deliverables` → Epics and Stories on the client's board.
 *
 * Reads the ROWS the `backlog` tool produced, not the markdown. The document says the same thing in
 * prose, and re-reading it here would mean parsing headings back into a hierarchy — the failure
 * `backlog.ts` exists to avoid.
 *
 * `markdown` is therefore ignored, and that is worth saying out loud rather than hiding behind an
 * unused parameter: a backlog that arrived as prose (an older draft, filed before the tool existed)
 * has no rows, and the honest outcome is to say so and create nothing.
 */
async function materialiseBacklog(actor: Actor, _markdown: string, taskId: string): Promise<Materialised> {
  const out: Materialised = { path: "02-scope/deliverables", created: 0, updated: 0, problems: [] };

  const rows = await backlogOf(taskId);
  if (!rows.length) {
    return {
      ...out,
      problems: [
        "This deliverable has no backlog rows, so nothing was created on the board. It was drafted " +
        "as a document rather than through the backlog tool — re-run the task to produce it as epics.",
      ],
    };
  }

  const mirrored = await mirrorBacklog(actor.engagementId, taskId, actor.roleCode);
  return {
    ...out,
    created: mirrored.epics.length + mirrored.stories.length,
    problems: mirrored.problems,
  };
}

/**
 * Put the sprint on the board: the committed stories labelled `sprint-N` and assigned.
 *
 * Reads the MARKDOWN, unlike `materialiseBacklog`, and the difference is the point. A backlog's
 * epics do not exist yet when the agent drafts them, so they are held as rows until Jira accepts
 * them. A sprint's stories already exist with keys — committing one is a change TO an issue — so
 * there is nothing to hold, and the only gap to cross is between the draft and the approval. The
 * document crosses it, exactly as it does for the roster.
 *
 * `commitmentsSection` rendered that table from the tool's structured input, so this parse is the
 * inverse of a deterministic render rather than an attempt to read whatever prose a model wrote.
 */
async function materialiseSprint(actor: Actor, markdown: string, taskId: string): Promise<Materialised> {
  const out: Materialised = { path: "05-cadence/sprint-plans", created: 0, updated: 0, problems: [] };

  const { commitments, problems } = parseCommitments(markdown);
  if (!commitments.length) {
    return {
      ...out,
      problems: [
        ...problems,
        "This plan commits to no stories that could be read, so nothing reached the board. It was " +
        "drafted as a document rather than through the sprint tool — re-run the task.",
      ],
    };
  }

  const mirrored = await mirrorSprint(actor.engagementId, taskId, actor.roleCode, commitments);
  return {
    ...out,
    updated: mirrored.placed.length,
    problems: [...problems, ...mirrored.problems],
  };
}

/**
 * What each declared output turns into. Register here; do not branch in the caller.
 *
 * KEYED ON THE STEP'S `output`, NOT ITS PATH. This was keyed on `produces`, and the reason was
 * sound — `sprint-0.draft-sprint-plan` and `sprint.sprint-planning` are the same step written
 * twice, and one registration against a shared path made them one behaviour with no second copy to
 * drift. The flaw was that `produces` is a path the author writes in a CSV. Renaming it made this
 * lookup miss, and approval then materialised nothing: no member rows, no issues, no sprint labels
 * — while the step closed green, because nothing here reports a miss.
 *
 * `output` is a closed vocabulary the app owns and the importer refuses unknown values for. Both
 * sprint-planning rows carry `sprint`, so they remain one behaviour by construction, and a path
 * rename can no longer disable anything.
 */
const REGISTRY: Record<
  string, (actor: Actor, markdown: string, taskId: string) => Promise<Materialised>
> = {
  roster: materialiseRoster,
  backlog: materialiseBacklog,
  sprint: materialiseSprint,
};

/**
 * The step this one reviews — same lookup `context.ts` makes for `ctx.reviewPath`, kept here
 * rather than imported: that module is agent-prompt-facing, this one is the data layer, and the
 * three-line join is cheaper than a cross-layer dependency for it.
 */
async function producingStep(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>, workflowVersionId: string, dependsOnTask: string,
): Promise<{ produces: string | null; output: string | null } | null> {
  const { data } = await sb.from("workflow_step")
    .select("produces, output").eq("workflow_version_id", workflowVersionId).eq("task", dependsOnTask)
    .maybeSingle();
  return data ? { produces: data.produces, output: data.output } : null;
}

/**
 * Does an independent reviewer depend on this step? If one does, ITS close is what should
 * materialise — not this one's. `propose-resource-plan`'s own close used to write `member` rows
 * the moment its author finished editing, before `approve-resource-plan` — the actual independent
 * check — had looked at any of it. `output` still lives on the drafting row (it is also what gets
 * the model the structured `roster`/`backlog`/`sprint` tool instead of free-form `draft`, and that
 * reason did not go away); this is what stops its OWN close from being the trigger when a real
 * review is coming.
 */
async function hasDownstreamReviewer(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>, workflowVersionId: string, taskSlug: string,
): Promise<boolean> {
  const { data } = await sb.from("workflow_step")
    .select("renders, depends_on").eq("workflow_version_id", workflowVersionId)
    .contains("depends_on", [taskSlug]);
  return (data ?? []).some((s) => s.renders === "doc-review" || s.renders === "code-review");
}

/**
 * Run whatever the closing task's produced document turns into.
 *
 * Called after a close succeeds. Returns null when the path has no materialiser, which is the
 * ordinary case — most documents are read by people, not by the app.
 */
export async function materialiseFrom(actor: Actor, taskId: string): Promise<Materialised | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: task } = await sb.from("work_task")
    .select("workflow_step_id, workflow_run_id").eq("id", taskId).maybeSingle();
  if (!task?.workflow_step_id) return null;

  const { data: step } = await sb.from("workflow_step")
    .select("task, produces, output, renders, depends_on, workflow_version_id")
    .eq("id", task.workflow_step_id).maybeSingle();
  if (!step) return null;

  // `doc-review`/`code-review`: this row authors nothing (`produces` is empty by construction,
  // see `plan.ts`'s import validation) — what materialises is what its ONE dependency produced.
  // Otherwise: an ordinary drafting row, UNLESS an independent reviewer depends on it, in which
  // case THAT row's close is the real trigger and this one defers.
  const source =
    step.renders === "doc-review" || step.renders === "code-review"
      ? await producingStep(sb, step.workflow_version_id as string, (step.depends_on as string[] | null)?.[0] ?? "")
      : (await hasDownstreamReviewer(sb, step.workflow_version_id as string, step.task as string))
        ? null
        : { produces: step.produces as string | null, output: step.output as string | null };
  if (!source) return null;

  // The declared output decides WHAT happens; the path only says where the document is read from.
  // A step that declares nothing materialises nothing, which is the common case.
  const run = source.output ? REGISTRY[source.output] : undefined;
  if (!run) return null;
  // Still the bare PATH for the read — a step may decorate `produces` with a destination
  // (`…@tickets`), and looking a document up by the decorated string finds nothing. A path naming
  // a subject (`…/{epic}`) is filled from the run, exactly as the write side filled it.
  const path = resolvePath(
    destinationOf(source.produces)?.path,
    await subjectOfRun(task.workflow_run_id as string | null),
  );
  if (!path) return null;

  const { data: doc } = await sb.from("document")
    .select("current_version_id").eq("engagement_id", actor.engagementId).eq("path", path).maybeSingle();
  if (!doc?.current_version_id) return { path, created: 0, updated: 0, problems: [`${path} has no filed version.`] };

  const { data: sections } = await sb.from("document_section")
    .select("heading, body").eq("document_version_id", doc.current_version_id).order("ord");
  const markdown = (sections ?? []).map((s) => `## ${s.heading}\n${s.body}`).join("\n\n");

  const result = await run(actor, markdown, taskId);

  await emit({
    engagementId: actor.engagementId, subjectType: "task", subjectId: taskId,
    verb: "document.materialised", actorKind: "system", actorRoleCode: actor.roleCode,
    payload: { path, created: result.created, updated: result.updated, problems: result.problems },
  });

  return result;
}
