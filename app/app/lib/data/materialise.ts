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
import type { Actor } from "./actor";
import { emit } from "./events";
import { parseRoster } from "./roster-rows";

export type Materialised = { path: string; created: number; updated: number; problems: string[] };

const initialsOf = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * `01-foundation/team` → `member` rows.
 *
 * Role LABELS are matched against the catalogue rather than hardcoded, because the agent writes
 * "Enterprise Architect" and the app stores `enterprise-architect`, and a hardcoded map would drift
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

  const { data: existing } = await sb.from("member")
    .select("id, role, name").eq("engagement_id", actor.engagementId);
  const already = new Map((existing ?? []).map((m) => [`${m.role}::${String(m.name).toLowerCase()}`, m]));

  let ord = existing?.length ?? 0;
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
      engagement_id: actor.engagementId, role: role.code,
      name: row.holder, title: role.title ?? role.label,
      initials: initialsOf(row.holder), ord: ord++,
    });
    if (error) out.problems.push(`${row.holder} (${role.code}): ${error.message}`);
    else out.created += 1;
  }

  return out;
}

/** What each producing path turns into. Register here; do not branch in the caller. */
const REGISTRY: Record<string, (actor: Actor, markdown: string) => Promise<Materialised>> = {
  "01-foundation/team": materialiseRoster,
};

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
    .select("workflow_step_id").eq("id", taskId).maybeSingle();
  if (!task?.workflow_step_id) return null;

  const { data: step } = await sb.from("workflow_step")
    .select("produces").eq("id", task.workflow_step_id).maybeSingle();
  const path = step?.produces;
  if (!path || !REGISTRY[path]) return null;

  const { data: doc } = await sb.from("document")
    .select("current_version_id").eq("engagement_id", actor.engagementId).eq("path", path).maybeSingle();
  if (!doc?.current_version_id) return { path, created: 0, updated: 0, problems: [`${path} has no filed version.`] };

  const { data: sections } = await sb.from("document_section")
    .select("heading, body").eq("document_version_id", doc.current_version_id).order("ord");
  const markdown = (sections ?? []).map((s) => `## ${s.heading}\n${s.body}`).join("\n\n");

  const result = await REGISTRY[path](actor, markdown);

  await emit({
    engagementId: actor.engagementId, subjectType: "task", subjectId: taskId,
    verb: "document.materialised", actorKind: "system", actorRoleCode: actor.roleCode,
    payload: { path, created: result.created, updated: result.updated, problems: result.problems },
  });

  return result;
}
