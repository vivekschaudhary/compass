import { supabaseAdmin } from "../../supabase";
import type { StoredStatus } from "./types";

/**
 * Criteria plus whatever was last measured, for DISPLAY.
 *
 * Deliberately read-only. Evaluating writes measurement rows, and a page render should not write —
 * quite apart from the impoliteness, it would make every refresh look like fresh evidence when
 * nothing had been re-checked. The button re-checks; the page shows what is on the record and when
 * it was put there.
 *
 * Batched across tasks: a card list would otherwise be two queries per card.
 */
export async function storedStatusFor(
  taskIds: string[],
): Promise<Map<string, StoredStatus[]>> {
  const out = new Map<string, StoredStatus[]>();
  const sb = supabaseAdmin();
  if (!sb || taskIds.length === 0) return out;

  const { data: tasks } = await sb
    .from("work_task")
    .select(
      "id, workflow_step_id, workflow_run!work_task_workflow_run_id_fkey(workflow_version_id)",
    )
    .in("id", taskIds);

  const { data: steps } = await sb.from("workflow_step").select("id, task");
  const taskOf = new Map((steps ?? []).map((s) => [s.id, s.task as string]));

  const versionIds = [
    ...new Set(
      (tasks ?? [])
        .map((t) => {
          const r = t.workflow_run as unknown as
            | { workflow_version_id: string }
            | { workflow_version_id: string }[]
            | null;
          return Array.isArray(r)
            ? r[0]?.workflow_version_id
            : r?.workflow_version_id;
        })
        .filter(Boolean),
    ),
  ] as string[];

  const { data: criteria } = versionIds.length
    ? await sb
        .from("criterion")
        .select(
          "id, workflow_version_id, kind, step_task, statement, subject_kind, subject_ref, operator, value, ord",
        )
        .in("workflow_version_id", versionIds)
        .order("ord")
    : { data: [] };

  const { data: measurements } = await sb
    .from("measurement")
    .select("task_id, criterion_id, satisfied, measured_at, source, detail")
    .in("task_id", taskIds);
  const key = (t: string, c: string) => `${t}:${c}`;
  const measured = new Map(
    (measurements ?? []).map((m) => [key(m.task_id, m.criterion_id), m]),
  );

  for (const t of tasks ?? []) {
    const r = t.workflow_run as unknown as
      | { workflow_version_id: string }
      | { workflow_version_id: string }[]
      | null;
    const versionId = Array.isArray(r)
      ? r[0]?.workflow_version_id
      : r?.workflow_version_id;
    const stepTask = t.workflow_step_id
      ? (taskOf.get(t.workflow_step_id) ?? null)
      : null;

    const mine = (criteria ?? [])
      .filter((c) => c.workflow_version_id === versionId)
      .filter((c) => c.step_task === null || c.step_task === stepTask)
      .map((c): StoredStatus => {
        const m = measured.get(key(t.id, c.id));
        return {
          id: c.id,
          kind: c.kind,
          stepTask: c.step_task,
          statement: c.statement,
          subjectKind: c.subject_kind,
          subjectRef: c.subject_ref,
          operator: c.operator,
          value: c.value,
          satisfied: m ? m.satisfied : null,
          measuredAt: m?.measured_at ?? null,
          source: m?.source ?? null,
          detail: m?.detail ?? null,
        };
      });

    out.set(t.id, mine);
  }
  return out;
}
