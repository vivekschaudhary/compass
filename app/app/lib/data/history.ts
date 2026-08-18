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
};

export async function history(actor: Actor): Promise<DoneJob[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  let q = sb.from("work_task")
    .select("id, title, role_code, state, closed_at, closed_by, started_at, workflow_step_id, workflow_run(workflow(code))")
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
  const { data: versions } = await sb.from("document_version")
    .select("version, external_url, created_by_task_id, document(path)").in("created_by_task_id", ids);

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

  type V = { version: string; external_url: string | null; created_by_task_id: string; document: { path: string } | { path: string }[] | null };
  const produced = new Map<string, { path: string; version: string; url: string | null }>();
  for (const v of (versions ?? []) as unknown as V[]) {
    const doc = Array.isArray(v.document) ? v.document[0] : v.document;
    if (doc) produced.set(v.created_by_task_id, { path: doc.path, version: v.version, url: v.external_url });
  }

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
    };
  });
}
