// What has already happened.
//
// The queue shows what is still yours to do, so a closed task leaves it — correctly. But it left
// the app entirely, which is the opposite of the point: a control tower whose completed work
// disappears is a to-do list, and the record of who decided what is the thing clients are actually
// buying.
//
// Same engagement filter and same role scope as the queue. History is not a place the rules relax.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./actor";

export type DoneJob = {
  id: string;
  title: string;
  workflowCode: string | null;
  roleCode: string;
  state: "closed" | "abandoned";
  closedAt: string | null;
  closedBy: string | null;
  startedAt: string | null;
  /** What it produced, if anything, and where that landed. */
  produced: { path: string; version: string; url: string | null } | null;
  /** How its Done criteria came out, and who said so. */
  criteria: { total: number; met: number; byHuman: number };
  turns: number;
  /**
   * Open top-level comments on the documents this task filed, across every version of them — what is
   * still unanswered on its work. Null when it could not be counted, never zero: a failed read that
   * said "none open" would hide exactly the work a drafter needs to come back to.
   */
  openComments: number | null;
};

export async function history(actor: Actor): Promise<DoneJob[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  let q = sb.from("work_task")
    .select("id, title, role_code, state, closed_at, closed_by, started_at, workflow_step_id, workflow_run!work_task_workflow_run_id_fkey(workflow(code))")
    .eq("engagement_id", actor.engagementId)
    .in("state", ["closed", "abandoned"]);

  if (actor.scope === "mine") q = q.eq("role_code", actor.roleCode);
  else if (actor.scope === "workstream" && actor.workstreamCode) q = q.eq("workstream_code", actor.workstreamCode);

  const { data } = await q.order("closed_at", { ascending: false });
  if (!data?.length) return [];

  const ids = data.map((t) => t.id);

  // Three queries for the whole list rather than three per row.
  const { data: measurements } = await sb.from("measurement")
    .select("task_id, satisfied, source, criterion!inner(kind)").in("task_id", ids);
  const { data: turns } = await sb.from("turn").select("task_id").in("task_id", ids);
  // The embed names its relationship. `document` and `document_version` are joined twice — a version
  // belongs to its document, and a document points at its current version — and a bare
  // `document(path)` is refused as ambiguous. That refusal came back as `data: null`, which read as
  // "nothing was produced": the History screen showed no document for any task, and nothing failed.
  const { data: versions, error: versionsError } = await sb.from("document_version")
    .select("version, external_url, created_by_task_id, document_id, document!document_version_document_id_fkey(path)")
    .in("created_by_task_id", ids);

  type M = { task_id: string; satisfied: boolean; source: string; criterion: { kind: string } | { kind: string }[] };
  const stats = new Map<string, { total: number; met: number; byHuman: number }>();
  for (const m of (measurements ?? []) as unknown as M[]) {
    const kind = (Array.isArray(m.criterion) ? m.criterion[0] : m.criterion)?.kind;
    if (kind !== "done") continue;
    const s = stats.get(m.task_id) ?? { total: 0, met: 0, byHuman: 0 };
    s.total += 1;
    if (m.satisfied) s.met += 1;
    if (m.satisfied && m.source === "human") s.byHuman += 1;
    stats.set(m.task_id, s);
  }

  const turnCount = new Map<string, number>();
  for (const t of turns ?? []) turnCount.set(t.task_id, (turnCount.get(t.task_id) ?? 0) + 1);

  type V = { version: string; external_url: string | null; created_by_task_id: string; document_id: string; document: { path: string } | { path: string }[] | null };
  const produced = new Map<string, { path: string; version: string; url: string | null }>();
  for (const v of (versions ?? []) as unknown as V[]) {
    const doc = Array.isArray(v.document) ? v.document[0] : v.document;
    if (doc) produced.set(v.created_by_task_id, { path: doc.path, version: v.version, url: v.external_url });
  }

  // A failed read of the versions is "could not count", not "no versions" — see `openComments`.
  const openComments = versionsError ? null : await openCommentsByTask((versions ?? []) as unknown as V[]);

  return data.map((t) => {
    const run = t.workflow_run as unknown as { workflow: { code: string } | null } | null;
    return {
      id: t.id,
      title: t.title,
      workflowCode: run?.workflow?.code ?? null,
      roleCode: t.role_code,
      state: t.state as "closed" | "abandoned",
      closedAt: t.closed_at,
      closedBy: t.closed_by,
      startedAt: t.started_at,
      produced: produced.get(t.id) ?? null,
      criteria: stats.get(t.id) ?? { total: 0, met: 0, byHuman: 0 },
      turns: turnCount.get(t.id) ?? 0,
      openComments: openComments === null ? null : openComments.get(t.id) ?? 0,
    };
  });
}

/**
 * For each task, how many open top-level comments stand on the documents it filed.
 *
 * The same question the approval gate asks of an authoring task — `created_by_task_id` names the
 * documents a task filed, and a comment counts on ANY version of one — answered here in a single pass
 * for a whole list. Null if any read failed, so the caller cannot mistake "could not look" for "none".
 */
async function openCommentsByTask(
  filed: { created_by_task_id: string; document_id: string }[],
): Promise<Map<string, number> | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  if (!filed.length) return new Map();

  const docsOfTask = new Map<string, Set<string>>();
  for (const f of filed) {
    docsOfTask.set(f.created_by_task_id, (docsOfTask.get(f.created_by_task_id) ?? new Set()).add(f.document_id));
  }
  const docIds = [...new Set(filed.map((f) => f.document_id))];

  const versions = await sb.from("document_version").select("id, document_id").in("document_id", docIds);
  if (versions.error) return null;
  const docOfVersion = new Map((versions.data ?? []).map((v) => [v.id as string, v.document_id as string]));
  if (!docOfVersion.size) return new Map();

  const sections = await sb.from("document_section").select("id, document_version_id").in("document_version_id", [...docOfVersion.keys()]);
  if (sections.error) return null;
  const docOfSection = new Map(
    (sections.data ?? []).map((s) => [s.id as string, docOfVersion.get(s.document_version_id as string)!]),
  );
  if (!docOfSection.size) return new Map();

  const comments = await sb.from("document_comment")
    .select("document_section_id").is("parent_id", null).eq("status", "open").in("document_section_id", [...docOfSection.keys()]);
  if (comments.error) return null;

  const openOnDoc = new Map<string, number>();
  for (const c of comments.data ?? []) {
    const doc = docOfSection.get(c.document_section_id as string);
    if (doc) openOnDoc.set(doc, (openOnDoc.get(doc) ?? 0) + 1);
  }

  const out = new Map<string, number>();
  for (const [task, docs] of docsOfTask) {
    out.set(task, [...docs].reduce((n, d) => n + (openOnDoc.get(d) ?? 0), 0));
  }
  return out;
}
