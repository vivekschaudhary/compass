import { supabaseAdmin } from "../../../supabase";
import { resolveJira, remoteLinks, issueStatus, searchIssues } from "../../../jira";
import { sprintJql, sprintNoOf } from "../../sprint";
import type { Actor } from "../../actor";
import type { CriterionRow, Verdict } from "../types";

/**
 * Every pull request URL the given run recorded when it finished (`agent.run.finished` events).
 *
 * Shared with `evaluators/ci.ts`: both need "what PR is this run about" for a run that has a
 * subject but no ticket, and neither should re-derive it differently.
 */
export async function recordedPrsOf(runId: string): Promise<string[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const { data: tasks } = await sb.from("work_task").select("id").eq("workflow_run_id", runId);
  const ids = (tasks ?? []).map((t) => t.id as string);
  if (!ids.length) return [];
  const { data: events } = await sb
    .from("event")
    .select("payload")
    .eq("verb", "agent.run.finished")
    .in("subject_id", ids);
  return [...new Set(
    (events ?? [])
      .map((e) => (e.payload as { pr?: string | null } | null)?.pr ?? null)
      .filter((u): u is string => !!u && /\/pull\/\d+/.test(u)),
  )];
}

/**
 * `pr-linked` for a run with a subject and no ticket — `scaffold-repo`, whose subject is a repo
 * key, not a Jira story. There is no issue to ask, so this reads the pull request the run itself
 * recorded when it finished. Weaker than asking the tracker (it trusts the app's own write instead
 * of reading it back), and it says so via `source: "compass"` rather than `"tracker"`. Still a real
 * bar: the app opens that PR only when the scaffold's own checks pass.
 */
async function evaluateRecordedPr(runId: string, subject: string): Promise<Verdict> {
  const prs = await recordedPrsOf(runId);
  return prs.length
    ? {
        state: "satisfied",
        source: "compass",
        detail: `${subject}: the run recorded ${prs.length} pull request(s): ${prs.join(", ")}.`,
      }
    : {
        state: "unsatisfied",
        source: "compass",
        detail: `${subject}: the run recorded no pull request — nothing shipped.`,
      };
}

/**
 * A criterion about the ONE story a run is the subject of.
 *
 * `pr-linked` is the build's real bar and it is deliberately indirect: the orchestrator opens a
 * pull request ONLY when the project's CI-parity checks pass, so a linked pull request is evidence
 * the checks ran and were green. Asking Jira what is on the issue rather than trusting the write
 * that put it there — a gate that reads back its own call is measuring itself.
 */
async function evaluateStoryTicket(
  actor: Actor,
  c: CriterionRow,
  taskId: string,
): Promise<Verdict> {
  const sb = supabaseAdmin();
  if (!sb) return { state: "unmeasurable", why: "no database" };

  const { data: task } = await sb
    .from("work_task")
    .select("workflow_run_id, subject_ref")
    .eq("id", taskId)
    .maybeSingle();
  const { data: run } = task?.workflow_run_id
    ? await sb
        .from("workflow_run")
        .select("subject_key, subject_ref")
        .eq("id", task.workflow_run_id)
        .maybeSingle()
    : { data: null };
  const key = (run?.subject_key as string | null) ?? null;
  // The TASK's own subject wins over the run's — a materialized per-repo task (`scaffold-repo`'s
  // inline fan-out) sits inside a run whose own subject is unrelated (the foundation-architecture
  // run has none), so reading only `run.subject_ref` found nothing and reported "no story on the
  // tracker" for a row that plainly names a repo. Same preference `subjectOfRun` already gives
  // `agent/context.ts` and the materializer.
  const subjectRef = (task?.subject_ref as string | null) ?? (run?.subject_ref as string | null) ?? null;
  // A run about a repo (`scaffold-repo`) has a subject and no story. Its pull request was never
  // put on a ticket — there is none — so the record is what the run itself wrote when it finished.
  if (!key && subjectRef && c.subjectRef === "pr-linked" && task?.workflow_run_id)
    return evaluateRecordedPr(task.workflow_run_id as string, subjectRef);
  if (!key) {
    // Not unsatisfied: a run with no story is misconfigured, not a build that failed. Blaming the
    // engineer for it would send someone to read a diff that was never produced.
    return {
      state: "unmeasurable",
      why: "this run has no story on the tracker to read",
    };
  }

  const { data: eng } = await sb
    .from("engagement")
    .select(
      "jira_project, atlassian_base_url, atlassian_email, atlassian_api_token",
    )
    .eq("id", actor.engagementId)
    .maybeSingle();
  const creds = eng ? resolveJira(eng) : null;
  if (!creds)
    return {
      state: "unmeasurable",
      why: "no Jira is configured for this engagement",
    };

  if (c.subjectRef === "pr-linked") {
    const links = await remoteLinks(creds, key);
    // Null is "could not look", which is not "found none". Collapsing them would report a missing
    // pull request during an outage.
    if (links === null)
      return { state: "unmeasurable", why: `${key} could not be read` };
    const prs = links.filter((l) => /\/pull\/\d+/.test(l.url));
    return prs.length
      ? {
          state: "satisfied",
          source: "tracker",
          detail: `${key} links ${prs.length} pull request(s): ${prs.map((p) => p.url).join(", ")}.`,
        }
      : {
          state: "unsatisfied",
          source: "tracker",
          detail: `${key} has no pull request linked — nothing shipped.`,
        };
  }

  const status = await issueStatus(creds, key);
  if (status === null)
    return { state: "unmeasurable", why: `${key} could not be read` };
  const want = (c.value ?? "Done").toLowerCase();
  return status.toLowerCase() === want
    ? { state: "satisfied", source: "tracker", detail: `${key} is ${status}.` }
    : {
        state: "unsatisfied",
        source: "tracker",
        detail: `${key} is ${status}, not ${c.value ?? "Done"}.`,
      };
}

/**
 * The sprint's criteria, answered by asking the tracker.
 *
 * NOT by reading what Compass believes it wrote. A gate that grades its own homework passes on a
 * sprint whose tickets never reached the board, and that is the whole reason this feature keeps no
 * sprint table: the board is the record, so the board is what gets asked.
 *
 * Three ways this could pass while checking nothing, all closed here:
 *
 *   an EMPTY result — the query ran and matched nothing. Every issue in an empty set satisfies
 *   every condition, so `every()` returns true and a sprint containing nothing would be reported
 *   complete. Unmeasurable.
 *
 *   a FAILED query — `searchIssues` returns null for "could not ask", which is why it does not
 *   return `[]` for it. Unmeasurable, with the reason.
 *
 *   NO SPRINT NUMBER — the task never claimed one, so nothing was ever labelled. That is
 *   unsatisfied rather than unmeasurable: "nothing reached the board" is a real, checkable answer,
 *   and calling it unmeasurable would let it read as a tooling gap rather than as work not done.
 */
export async function evaluateTicket(
  actor: Actor,
  c: CriterionRow,
  taskId: string | null,
): Promise<Verdict> {
  const sb = supabaseAdmin();
  if (!sb || !taskId)
    return { state: "unmeasurable", why: "no task to read a sprint from" };

  // STORY-SCOPED FIRST. The refs below are about ONE issue — the story this run is about — and
  // everything after them is about a sprint's worth of them. They were separated rather than folded
  // together because `sprintNoOf` returns null for a build run, and falling through would report
  // "this plan has no sprint number" for a workflow that never had one.
  if (c.subjectRef === "pr-linked" || c.subjectRef === "merged") {
    return evaluateStoryTicket(actor, c, taskId);
  }

  const n = await sprintNoOf(taskId);
  if (!n) {
    return {
      state: "unsatisfied",
      source: "compass",
      detail:
        "This plan has no sprint number, so no story was ever labelled or assigned. " +
        "Nothing reached the board.",
    };
  }

  const { data: eng } = await sb
    .from("engagement")
    .select(
      "jira_project, atlassian_base_url, atlassian_email, atlassian_api_token",
    )
    .eq("id", actor.engagementId)
    .maybeSingle();
  const creds = eng ? resolveJira(eng) : null;
  if (!creds)
    return {
      state: "unmeasurable",
      why: "no Jira is configured for this engagement",
    };

  const issues = await searchIssues(creds, sprintJql(creds.project, n), [
    "assignee",
    "labels",
    "parent",
  ]);
  if (issues === null) {
    return {
      state: "unmeasurable",
      why: `the board could not be read for sprint ${n}`,
    };
  }
  if (!issues.length) {
    // The zero-row trap, said out loud. `every()` over nothing is true.
    return {
      state: "unmeasurable",
      why: `no issue on the board carries sprint ${n} — there is nothing to check`,
    };
  }

  const { data: roleRows } = await sb
    .from("role")
    .select("code")
    .eq("org_id", actor.orgId);
  const knownRoles = new Set((roleRows ?? []).map((r) => r.code as string));

  if (c.subjectRef === "committed-have-epic") {
    const orphans = issues.filter((i) => !i.fields.parent);
    return orphans.length === 0
      ? {
          state: "satisfied",
          source: "tracker",
          detail: `All ${issues.length} stories in sprint ${n} sit under an epic.`,
        }
      : {
          state: "unsatisfied",
          source: "tracker",
          detail: `${orphans.length} of ${issues.length} have no epic: ${orphans.map((o) => o.key).join(", ")}.`,
        };
  }

  if (c.subjectRef === "on-board") {
    const unassigned = issues.filter((i) => !i.fields.assignee);
    const unowned = issues.filter((i) => {
      const labels = Array.isArray(i.fields.labels)
        ? (i.fields.labels as string[])
        : [];
      return !labels.some((l) => knownRoles.has(l));
    });
    if (!unassigned.length && !unowned.length) {
      return {
        state: "satisfied",
        source: "tracker",
        detail: `All ${issues.length} stories in sprint ${n} have an owning role and an assignee.`,
      };
    }
    // Named, not counted. "KAN-14, KAN-19" sends someone somewhere; "2 of 11" sends them hunting.
    const parts: string[] = [];
    if (unassigned.length)
      parts.push(`unassigned: ${unassigned.map((i) => i.key).join(", ")}`);
    if (unowned.length)
      parts.push(`no owning role: ${unowned.map((i) => i.key).join(", ")}`);
    return {
      state: "unsatisfied",
      source: "tracker",
      detail: `Of ${issues.length} stories in sprint ${n} — ${parts.join("; ")}.`,
    };
  }

  return {
    state: "unmeasurable",
    why: `judgment — a person decides '${c.subjectRef}'`,
  };
}
