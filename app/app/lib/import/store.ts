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
import { readShippedDocTree } from "../doctree";
import { COMPASS_DIR } from "../specs";
import type { ConfigStore } from "./apply";
import type { Existing, StepRow, CriterionRow, WorkstreamRow, PhaseRow, TicketBriefRow, RoleRow, WorkflowRow } from "./plan";

// NOTE ON THE REPEATED TERNARY BELOW: `.eq()` cannot match NULL, and the natural keys are
// `unique nulls not distinct`, so an org-default row (engagement_id IS NULL) needs `.is()`
// instead. A generic helper reads better but trips TS2589 — Supabase's builder types are deep
// enough that inferring through a wrapper exceeds the instantiation limit. Inline it is.

/** The store, creating its own client. Routes ask for this rather than making one themselves —
 *  data access belongs in a data layer, and the lint rule on everything outside lib/ enforces it. */
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

    async upsertPhase(orgId, engagementId, row) {
      const patch = {
        label: row.label, ord: row.ord, enabled: row.enabled, cycles: row.cycles,
        updated_at: new Date().toISOString(),
      };
      const base = sb.from("phase").select("id").eq("org_id", orgId).eq("code", row.code);
      const found = await (engagementId === null
        ? base.is("engagement_id", null)
        : base.eq("engagement_id", engagementId)).maybeSingle();
      fail("read phase", found.error);
      if (found.data) {
        fail("update phase", (await sb.from("phase").update(patch).eq("id", found.data.id)).error);
      } else {
        fail("insert phase", (await sb.from("phase").insert({ org_id: orgId, engagement_id: engagementId, code: row.code, ...patch })).error);
      }
    },

    async upsertTicketBrief(orgId, engagementId, row) {
      const patch = { brief: row.brief, enabled: row.enabled, updated_at: new Date().toISOString() };
      const base = sb.from("ticket_brief").select("id").eq("org_id", orgId).eq("code", row.code);
      const found = await (engagementId === null
        ? base.is("engagement_id", null)
        : base.eq("engagement_id", engagementId)).maybeSingle();
      fail("read ticket brief", found.error);
      if (found.data) {
        fail("update ticket brief", (await sb.from("ticket_brief").update(patch).eq("id", found.data.id)).error);
      } else {
        fail("insert ticket brief", (await sb.from("ticket_brief").insert({ org_id: orgId, engagement_id: engagementId, code: row.code, ...patch })).error);
      }
    },

    async upsertRole(orgId, engagementId, row) {
      const patch = {
        label: row.label, title: row.title, tier: row.tier, scope: row.scope,
        workstream_code: row.workstream || null, agent: row.agent || null,
        hosts: row.hosts, capabilities: row.capabilities, updated_at: new Date().toISOString(),
        // Present in the seed means in service. A role that was retired and has come back is
        // re-enabled here rather than needing anyone to notice it is still switched off.
        enabled: true,
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

    async retire(orgId, engagementId, kind, code) {
      // `enabled: false`, never a delete — see 20260101004300_role_enabled.sql. A retired role still
      // resolves for every historical task that named it; it just stops being offered.
      const table = kind === "role" ? "role" : "workflow";
      const q = sb.from(table).update({ enabled: false, updated_at: new Date().toISOString() })
        .eq("org_id", orgId).eq("code", code);
      fail(`retire ${kind} ${code}`, (await (engagementId === null
        ? q.is("engagement_id", null)
        : q.eq("engagement_id", engagementId))).error);
    },

    async upsertWorkflow(orgId, engagementId, row) {
      const patch = {
        label: row.label, workstream_code: row.workstream, phase_code: row.phase || null,
        owner_role_code: row.ownerRole || null, trigger: row.trigger || null,
        enabled: row.enabled, repeatable: row.repeatable,
        inputs: row.inputs, outputs: row.outputs,
        updated_at: new Date().toISOString(),
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
        output: s.output || null,
        conditional: s.conditional || null,
        nests_workflow_code: s.kind === "workflow" ? s.nests : null,
        title: s.title || null,
        template: s.template || null,
        // Checked at COMMIT, not per row — the backward-only rule is a deferred constraint trigger
        // precisely because these arrive in one insert and cannot see each other before then.
        depends_on: s.dependsOn,
        renders: s.renders,
      })))).error);
    },

    async addCriteria(versionId, criteria) {
      if (!criteria.length) return;
      fail("insert criteria", (await sb.from("criterion").insert(criteria.map((c, i) => ({
        // `ord` is a running index over file order — display order only, now that which STEP a
        // criterion belongs to is carried by the slug rather than by a position.
        workflow_version_id: versionId, step_task: c.stepTask, kind: c.kind, ord: i,
        statement: c.text,                                  // `statement` in the schema; `text` in the CSV
        subject_kind: c.subjectKind || null, subject_ref: c.subjectRef || null,
        operator: c.operator || null, value: c.value || null,
        // Derived from the nested workflow's interface, not written in criteria.csv.
        generated: c.generated === true,
      })))).error);
    },

    async publishedVersion(workflowId) {
      const { data, error } = await sb.from("workflow_version")
        .select("id").eq("workflow_id", workflowId).eq("status", "published").maybeSingle();
      fail("read published version", error);
      return (data?.id as string) ?? null;
    },

    // Matched on `ord`, which is the version's natural key for a step — `unique (workflow_version_id,
    // ord)`. A row that still exists is UPDATED so it keeps its id: `work_task.workflow_step_id` has
    // no `on delete` rule, so deleting a step a running task points at fails outright, and deleting
    // one nothing points at would orphan nothing but churn ids for no reason.
    async syncSteps(versionId, steps) {
      const { data: before, error } = await sb.from("workflow_step")
        .select("id, ord").eq("workflow_version_id", versionId);
      fail("read steps", error);
      const byOrd = new Map((before ?? []).map((r) => [r.ord as number, r.id as string]));

      for (const s of steps) {
        const patch = {
          kind: s.kind,
          role_code: s.kind === "machine" ? null : s.role,
          task: s.task, produces: s.produces || null, reads: s.reads,
          output: s.output || null,
          conditional: s.conditional || null,
          nests_workflow_code: s.kind === "workflow" ? s.nests : null,
          title: s.title || null,
          template: s.template || null,
          depends_on: s.dependsOn,
          renders: s.renders,
        };
        const id = byOrd.get(s.ord);
        if (id) {
          fail("update step", (await sb.from("workflow_step").update(patch).eq("id", id)).error);
          byOrd.delete(s.ord);
        } else {
          fail("insert step", (await sb.from("workflow_step")
            .insert({ workflow_version_id: versionId, ord: s.ord, ...patch })).error);
        }
      }

      // Whatever the seed no longer has. A task still pointing at one makes this fail, loudly — the
      // seed removed a row somebody is running, and that is a conflict for a person to resolve, not
      // something an importer should decide.
      for (const id of byOrd.values()) {
        fail("remove step", (await sb.from("workflow_step").delete().eq("id", id)).error);
      }
    },

    // Matched on CONTENT, because a criterion has no natural key. An unchanged criterion keeps its
    // id, and with it every `measurement` written against it — `measurement.criterion_id` is
    // `on delete cascade`, so replacing the set wholesale would erase the confirmations a person
    // already gave. Only a criterion the seed no longer states is deleted, and losing its
    // measurements is then correct: the thing they measured is gone.
    async syncCriteria(versionId, criteria) {
      const { data: before, error } = await sb.from("criterion")
        .select("id, step_task, kind, statement, subject_kind, subject_ref, operator, value")
        .eq("workflow_version_id", versionId);
      fail("read criteria", error);

      const key = (c: {
        step_task: string | null; kind: string; statement: string | null;
        subject_kind: string | null; subject_ref: string | null; operator: string | null; value: string | null;
      }) => [c.step_task ?? "", c.kind, c.statement ?? "", c.subject_kind ?? "",
             c.subject_ref ?? "", c.operator ?? "", c.value ?? ""].join("\u0000");

      const keep = new Map((before ?? []).map((r) => [key(r), r.id as string]));
      const add: CriterionRow[] = [];
      const seen = new Set<string>();

      for (const c of criteria) {
        const k = key({
          step_task: c.stepTask, kind: c.kind, statement: c.text,
          subject_kind: c.subjectKind || null, subject_ref: c.subjectRef || null,
          operator: c.operator || null, value: c.value || null,
        });
        if (keep.has(k)) { seen.add(k); continue; }
        add.push(c);
      }

      for (const [k, id] of keep) {
        if (seen.has(k)) continue;
        fail("remove criterion", (await sb.from("criterion").delete().eq("id", id)).error);
      }
      await this.addCriteria(versionId, add);
    },
  };
}

/**
 * Open runs executing a version that is no longer the published one.
 *
 * Not a failure and not something to fix here — a run pins its version deliberately. This exists
 * because the pin was INVISIBLE: sprint-0 v5 fixed criteria that had slid onto the wrong rows, the
 * import said "unchanged" because the seed matched the published version, and the live board went
 * on executing v4 with a Done gate that could never close. The number is the only thing standing
 * between that and another session spent tracing it.
 *
 * Counts, deliberately, rather than listing: it is a prompt to run `scripts/repoint-runs.mts`,
 * which does the naming and the validating.
 */
export async function countStaleRuns(): Promise<number> {
  const sb = supabaseAdmin();
  if (!sb) return 0;

  const { data: runs } = await sb.from("workflow_run")
    .select("id, workflow_version_id").neq("state", "closed");
  if (!runs?.length) return 0;

  const { data: versions } = await sb.from("workflow_version").select("id, workflow_id, status");
  const workflowOf = new Map((versions ?? []).map((v) => [v.id as string, v.workflow_id as string]));
  const publishedFor = new Map(
    (versions ?? []).filter((v) => v.status === "published").map((v) => [v.workflow_id as string, v.id as string]),
  );

  // A run whose workflow has NO published version is not counted. That is a different problem —
  // the workflow was retired under it — and folding the two together would make this number mean
  // two things, which is how a signal stops being read.
  return runs.filter((r) => {
    const published = publishedFor.get(workflowOf.get(r.workflow_version_id) ?? "");
    return published !== undefined && published !== r.workflow_version_id;
  }).length;
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
  if (!org) return { workstreams: [], roles: [], agents, phases: [], ticketBriefs: [], documents: [], workflows: [] };

  // IN SERVICE only. A row already retired is not "existing" for planning purposes: listing it
  // would have the importer retire it again on every run, and a retirement that repeats forever is
  // noise in the one report that must be read.
  //
  // The cost is that a retired role returning to the seed plans as "create". The effect is right —
  // `upsertRole` finds it by code and re-enables it rather than inserting a duplicate — but the
  // label understates it, which is better than a plan that says "unchanged" about a row nobody can
  // currently be assigned to.
  const list = async (table: string) => {
    const q = sb.from(table).select("code").eq("org_id", org.id).eq("enabled", true);
    const { data } = await (engagementId === null
      ? q.is("engagement_id", null)
      : q.eq("engagement_id", engagementId));
    return (data ?? []).map((r: { code: string }) => r.code);
  };

  // IN SERVICE only, for the same reason `list` filters: a workflow already retired is not
  // "existing" for planning, and listing it has the importer retire it again on every run. The role
  // path got this right and this one did not, so `basecamp` and `groundwork` reappeared in the
  // retire list of every subsequent import — a report that cries wolf is a report nobody reads.
  const wfQuery = sb.from("workflow").select("id, code").eq("org_id", org.id).eq("enabled", true);
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
      .select("ord, kind, role_code, task, produces, output, reads, conditional, nests_workflow_code, title, template, depends_on, renders")
      .eq("workflow_version_id", ver.id).order("ord");
    const { data: crits } = await sb.from("criterion")
      .select("step_task, kind, statement, subject_kind, subject_ref, operator, value")
      .eq("workflow_version_id", ver.id).order("ord");

    workflows.push({
      code: wf.code,
      steps: (steps ?? []).map((s): StepRow => ({
        workflow: wf.code, ord: s.ord, kind: s.kind, role: s.role_code ?? "", task: s.task,
        produces: s.produces ?? "", output: s.output ?? "",
        reads: s.reads ?? [], conditional: s.conditional ?? "",
        nests: s.nests_workflow_code ?? "", title: s.title ?? "",
        template: s.template ?? "",
        dependsOn: s.depends_on ?? [],
        renders: s.renders ?? "",
      })),
      criteria: (crits ?? []).map((c): CriterionRow => ({
        workflow: wf.code, stepTask: c.step_task, kind: c.kind, text: c.statement ?? "",
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

  // The DECLARED tree counts as well as the scaffolded rows.
  //
  // The check this feeds exists to catch a typo — the first seed read `02-scope-sow/sow-source.md`
  // against a tree that had `02-scope/sow`. A path that IS in the doc tree is not that: it is a
  // document the engagement is declared to have, and whether a row has been scaffolded for it yet
  // is a question about intake, not about whether the seed is correct.
  //
  // Without this, declaring a NEW document and the step that reads it can never be one commit: the
  // import refuses until the row exists, and the row is created by the import.
  const declared = readShippedDocTree().filter((n) => n.kind !== "folder").map((n) => n.path);

  return {
    workstreams: await list("workstream"),
    roles: await list("role"),
    agents, phases: await list("phase"), ticketBriefs: await list("ticket_brief"),
    documents: [...new Set([...(docs ?? []).map((d: { path: string }) => d.path), ...declared])],
    workflows,
  };
}

export type { WorkstreamRow, RoleRow, WorkflowRow };
