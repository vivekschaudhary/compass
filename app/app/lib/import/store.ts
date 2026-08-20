// The Supabase implementation of ConfigStore, plus reading current state back for the plan.
//
// Deliberately select-then-write rather than PostgREST upsert. The natural keys are
// `unique nulls not distinct (org_id, engagement_id, code)`, and an org-default row has a NULL
// engagement_id — which is exactly the case `on_conflict` handles least predictably. Two round
// trips that behave the same every time beat one that behaves differently for org rows than for
// engagement rows.

import { readdirSync, existsSync } from "fs";
import { join } from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../supabase";
import { COMPASS_DIR } from "../specs";
import type { ConfigStore } from "./apply";
import type { Existing, StepRow, CriterionRow, WorkstreamRow, RoleRow, WorkflowRow } from "./plan";

// NOTE ON THE REPEATED TERNARY BELOW: `.eq()` cannot match NULL, and the natural keys are
// `unique nulls not distinct`, so an org-default row (engagement_id IS NULL) needs `.is()`
// instead. A generic helper reads better but trips TS2589 — Supabase's builder types are deep
// enough that inferring through a wrapper exceeds the instantiation limit. Inline it is.

/** The store, creating its own client. Routes ask for this rather than making one themselves —
 *  data access belongs in a data layer, and the lint rule on app/api/v2 enforces it. */
export function configStore(): ConfigStore | null {
  const sb = supabaseAdmin();
  return sb ? supabaseConfigStore(sb) : null;
}

export function supabaseConfigStore(sb: SupabaseClient): ConfigStore {
  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  };

  return {
    async orgId(code) {
      const { data, error } = await sb.from("org").select("id").eq("code", code).maybeSingle();
      fail("read org", error);
      if (data?.id) return data.id as string;

      const created = await sb.from("org").insert({ code, name: code }).select("id").single();
      fail("create org", created.error);
      return created.data!.id as string;
    },

    async upsertWorkstream(orgId, engagementId, row) {
      const patch = { label: row.label, ord: row.ord, enabled: row.enabled, updated_at: new Date().toISOString() };
      const base = sb.from("workstream").select("id").eq("org_id", orgId).eq("code", row.code);
      const found = await (engagementId === null
        ? base.is("engagement_id", null)
        : base.eq("engagement_id", engagementId)).maybeSingle();
      fail("read workstream", found.error);
      if (found.data) {
        fail("update workstream", (await sb.from("workstream").update(patch).eq("id", found.data.id)).error);
      } else {
        fail("insert workstream", (await sb.from("workstream").insert({ org_id: orgId, engagement_id: engagementId, code: row.code, ...patch })).error);
      }
    },

    async upsertRole(orgId, engagementId, row) {
      const patch = {
        label: row.label, title: row.title, tier: row.tier, scope: row.scope,
        workstream_code: row.workstream || null, agent: row.agent || null,
        hosts: row.hosts, capabilities: row.capabilities, updated_at: new Date().toISOString(),
      };
      const base = sb.from("role").select("id").eq("org_id", orgId).eq("code", row.code);
      const found = await (engagementId === null
        ? base.is("engagement_id", null)
        : base.eq("engagement_id", engagementId)).maybeSingle();
      fail("read role", found.error);
      if (found.data) {
        fail("update role", (await sb.from("role").update(patch).eq("id", found.data.id)).error);
      } else {
        fail("insert role", (await sb.from("role").insert({ org_id: orgId, engagement_id: engagementId, code: row.code, ...patch })).error);
      }
    },

    async upsertWorkflow(orgId, engagementId, row) {
      const patch = {
        label: row.label, workstream_code: row.workstream, phase_code: row.phase || null,
        owner_role_code: row.ownerRole || null, trigger: row.trigger || null,
        enabled: row.enabled, updated_at: new Date().toISOString(),
      };
      const base = sb.from("workflow").select("id").eq("org_id", orgId).eq("code", row.code);
      const found = await (engagementId === null
        ? base.is("engagement_id", null)
        : base.eq("engagement_id", engagementId)).maybeSingle();
      fail("read workflow", found.error);
      if (found.data) {
        fail("update workflow", (await sb.from("workflow").update(patch).eq("id", found.data.id)).error);
        return found.data.id as string;
      }
      const created = await sb.from("workflow")
        .insert({ org_id: orgId, engagement_id: engagementId, code: row.code, ...patch })
        .select("id").single();
      fail("insert workflow", created.error);
      return created.data!.id as string;
    },

    async latestVersion(workflowId) {
      const { data, error } = await sb.from("workflow_version")
        .select("version").eq("workflow_id", workflowId)
        .order("version", { ascending: false }).limit(1).maybeSingle();
      fail("read latest version", error);
      return (data?.version as number) ?? 0;
    },

    async supersedePublished(workflowId) {
      // Must happen before the new version is inserted: `workflow_version_one_published` is a
      // partial unique index, so two published rows is a database error rather than a silent race.
      fail("supersede", (await sb.from("workflow_version")
        .update({ status: "superseded" })
        .eq("workflow_id", workflowId).eq("status", "published")).error);
    },

    async createVersion(workflowId, version, notes, createdBy) {
      const created = await sb.from("workflow_version")
        .insert({ workflow_id: workflowId, version, status: "published", notes, created_by: createdBy })
        .select("id").single();
      fail("create version", created.error);
      return created.data!.id as string;
    },

    async addSteps(versionId, steps) {
      if (!steps.length) return;
      fail("insert steps", (await sb.from("workflow_step").insert(steps.map((s) => ({
        workflow_version_id: versionId, ord: s.ord, kind: s.kind,
        role_code: s.kind === "machine" ? null : s.role,   // the check constraint enforces this too
        task: s.task, produces: s.produces || null, reads: s.reads,
        conditional: s.conditional || null,
        nests_workflow_code: s.kind === "workflow" ? s.nests : null,
        title: s.title || null,
        // Checked at COMMIT, not per row — the backward-only rule is a deferred constraint trigger
        // precisely because these arrive in one insert and cannot see each other before then.
        depends_on: s.dependsOn,
      })))).error);
    },

    async addCriteria(versionId, criteria) {
      if (!criteria.length) return;
      fail("insert criteria", (await sb.from("criterion").insert(criteria.map((c, i) => ({
        workflow_version_id: versionId, step_ord: c.stepOrd, kind: c.kind, ord: i,
        statement: c.text,                                  // `statement` in the schema; `text` in the CSV
        subject_kind: c.subjectKind || null, subject_ref: c.subjectRef || null,
        operator: c.operator || null, value: c.value || null,
      })))).error);
    },
  };
}

/**
 * What already exists, so the plan can tell new from changed.
 *
 * `agents` comes from disk, not the database: a role's agent file is what actually gets loaded as
 * a system prompt, so the only honest check is whether the file is there.
 */
/** Current state for the plan, creating its own client. Null when Supabase is unconfigured. */
export async function readExistingFor(orgCode: string, engagementId: string | null): Promise<Existing | null> {
  const sb = supabaseAdmin();
  return sb ? readExisting(sb, orgCode, engagementId) : null;
}

export async function readExisting(
  sb: SupabaseClient, orgCode: string, engagementId: string | null,
): Promise<Existing> {
  const agentsDir = join(COMPASS_DIR, "agents");
  const agents = existsSync(agentsDir)
    ? readdirSync(agentsDir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3))
    : [];

  const { data: org } = await sb.from("org").select("id").eq("code", orgCode).maybeSingle();
  if (!org) return { workstreams: [], roles: [], agents, phases: [], documents: [], workflows: [] };

  const list = async (table: string) => {
    const q = sb.from(table).select("code").eq("org_id", org.id);
    const { data } = await (engagementId === null
      ? q.is("engagement_id", null)
      : q.eq("engagement_id", engagementId));
    return (data ?? []).map((r: { code: string }) => r.code);
  };

  const wfQuery = sb.from("workflow").select("id, code").eq("org_id", org.id);
  const { data: wfRows } = await (engagementId === null
    ? wfQuery.is("engagement_id", null)
    : wfQuery.eq("engagement_id", engagementId));

  const workflows: Existing["workflows"] = [];
  for (const wf of wfRows ?? []) {
    const { data: ver } = await sb.from("workflow_version")
      .select("id").eq("workflow_id", wf.id).eq("status", "published").maybeSingle();
    if (!ver) { workflows.push({ code: wf.code, steps: [], criteria: [] }); continue; }

    // Every column the diff key compares. A field selected on the way IN but not on the way BACK
    // makes the comparison read `undefined` against a real value, so every row reports changed —
    // the mirror image of the bug where a field is compared on neither side and nothing ever does.
    const { data: steps } = await sb.from("workflow_step")
      .select("ord, kind, role_code, task, produces, reads, conditional, nests_workflow_code, title, depends_on")
      .eq("workflow_version_id", ver.id).order("ord");
    const { data: crits } = await sb.from("criterion")
      .select("step_ord, kind, statement, subject_kind, subject_ref, operator, value")
      .eq("workflow_version_id", ver.id).order("ord");

    workflows.push({
      code: wf.code,
      steps: (steps ?? []).map((s): StepRow => ({
        workflow: wf.code, ord: s.ord, kind: s.kind, role: s.role_code ?? "", task: s.task,
        produces: s.produces ?? "", reads: s.reads ?? [], conditional: s.conditional ?? "",
        nests: s.nests_workflow_code ?? "", title: s.title ?? "",
        dependsOn: s.depends_on ?? [],
      })),
      criteria: (crits ?? []).map((c): CriterionRow => ({
        workflow: wf.code, stepOrd: c.step_ord, kind: c.kind, text: c.statement ?? "",
        subjectKind: c.subject_kind ?? "", subjectRef: c.subject_ref ?? "",
        operator: c.operator ?? "", value: c.value ?? "",
      })),
    });
  }

  // Document paths, so `reads` can be checked against reality.
  //
  // For an engagement-scoped import that is this engagement's tree. For an ORG-LEVEL import there
  // is no single tree to check against, so the union across engagements is used instead: a path
  // that exists on no engagement anywhere is almost certainly a typo, and a path that exists
  // somewhere is at least plausible. Weaker than a per-engagement check, and honest about it.
  const docQuery = sb.from("document").select("path");
  const { data: docs } = engagementId === null
    ? await docQuery
    : await docQuery.eq("engagement_id", engagementId);

  return {
    workstreams: await list("workstream"),
    roles: await list("role"),
    agents, phases: await list("phase"),
    documents: [...new Set((docs ?? []).map((d: { path: string }) => d.path))],
    workflows,
  };
}

export type { WorkstreamRow, RoleRow, WorkflowRow };
