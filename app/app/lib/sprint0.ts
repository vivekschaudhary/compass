import { readFileSync } from "fs";
import { resolve } from "path";
import { supabaseAdmin } from "./supabase";
import { resolveJira, createIssue, transitionIssue } from "./jira";
import { COMPASS_ROLES } from "./data";
import { STATUS } from "./lifecycle";
import { engagementReadiness, readinessRefusal, type Readiness } from "./readiness";

// Sprint 0 — the engagement kickoff backlog, materialized from the framework spec at the END of
// Phase A. Lifted out of api/intake so the seeder, the admin editor and tests can all reach it.
//
// The spec (compass/templates/sprint-0.md) is the source of truth: add a row there and every new
// engagement starts with that ticket, no code change.

// The framework's compass/ dir — where the specs live. Same resolution as repo.ts / doctree.ts.
const COMPASS_DIR = process.env.COMPASS_DIR || `${process.env.COMPASS_REPO || resolve(process.cwd(), "..")}/compass`;

const ROLE_CODES = COMPASS_ROLES.map((r) => r.code);
function normTeamRole(raw: string): string | null {
  const r = (raw || "").toLowerCase().trim().replace(/\s+/g, "-");
  if (ROLE_CODES.includes(r)) return r;
  return COMPASS_ROLES.find((x) => x.label.toLowerCase() === (raw || "").toLowerCase().trim())?.code ?? null;
}

export type Sprint0Row = { ticket: string; workflow: string; owner: string; gate: string };

/** Parse the ticket TABLE out of compass/templates/sprint-0.md. Mirrors doctree's doc-tree read. */
export function readSprint0(): Sprint0Row[] {
  let md = "";
  try { md = readFileSync(`${COMPASS_DIR}/templates/sprint-0.md`, "utf8"); } catch { return []; }
  const section = md.split(/^##\s+/m).find((s) => /^tickets/i.test(s.trim())) ?? "";
  const rows: Sprint0Row[] = [];
  for (const line of section.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    const c = t.split("|").slice(1, -1).map((x) => x.trim());
    if (c.length < 5 || !/^\d+$/.test(c[0])) continue;   // data rows only (skip header + separator)
    rows.push({ ticket: c[1], workflow: c[2], owner: c[3], gate: c[4] });
  }
  return rows;
}

/**
 * The engagement's Sprint 0 epic, found by MARK rather than by id.
 *
 * Its id is the Jira key when the tracker is wired and `<engagement>-S0` when it isn't, so any
 * caller that reconstructs the id is right only in the fallback case — which is how the backlog
 * became invisible in the app exactly when Jira worked. `kind = 'sprint-0'` holds regardless
 * (018_sprint0_epic_kind.sql), with the legacy id as a fallback for rows created before it.
 */
export async function findSprint0Epic(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>, engagementId: string,
): Promise<{ id: string } | null> {
  const { data } = await sb.from("epic").select("id")
    .eq("engagement_id", engagementId).eq("kind", "sprint-0").maybeSingle();
  if (data) return data;
  const { data: legacy } = await sb.from("epic").select("id").eq("id", `${engagementId}-S0`).maybeSingle();
  return legacy ?? null;
}

/**
 * Materialize the kickoff backlog. Runs at the END of Phase A — see completePhaseA.
 *
 * Creates in JIRA when it is reachable, then stores the returned keys as the local ids so the board
 * and the app agree on ONE identity. Falls back to local-only ids when Jira is unreachable, which
 * keeps a docs-only engagement working rather than blocking setup on a tracker.
 *
 * Ticket 1 ("Connect systems of record") is created ALREADY DONE. Its gate is
 * `tickets.wired && docs.wired && scm.wired`, which is precisely what the readiness probe asserted
 * to get here — leaving it open would be asking a human to tick off work Compass just verified.
 *
 * Idempotent: returns 0 if the Sprint 0 epic already exists, so re-running provisioning never
 * duplicates the backlog.
 */
export async function createSprint0(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>, engagementId: string,
): Promise<{ created: number; jira: boolean; closed: number }> {
  const rows = readSprint0();
  if (!rows.length) return { created: 0, jira: false, closed: 0 };
  if (await findSprint0Epic(sb, engagementId)) return { created: 0, jira: false, closed: 0 };

  const { data: eng } = await sb.from("engagement")
    .select("name, atlassian_base_url, atlassian_email, atlassian_api_token, jira_project")
    .eq("id", engagementId).maybeSingle();
  const jira = eng ? resolveJira(eng) : null;

  // Epic in Jira first — its key becomes the local epic id, so there is ONE identity for it.
  let epicId = `${engagementId}-S0`;
  let inJira = false;
  if (jira) {
    const issue = await createIssue(jira, {
      type: "Epic", summary: `Sprint 0 · Foundation & Setup — ${eng?.name ?? engagementId}`,
      description: "Kickoff backlog, created from Compass's sprint-0.md spec.",
    });
    if (issue?.key) { epicId = issue.key; inJira = true; }
  }

  await sb.from("epic").insert({
    id: epicId, engagement_id: engagementId, title: "Sprint 0 · Foundation & Setup",
    deliverable_code: null, discipline: "Product", phase: "Kickoff", status: "idle",
    kind: "sprint-0",
    note: "Foundation setup — created from the sprint-0.md spec at kickoff.", ord: 0,
  });

  // The connect-systems ticket is satisfied by the readiness check that gated this call. Match on
  // the GATE, not the title: the title is spec text a DM may reword, the gate names the invariant.
  const isConnectSystems = (r: Sprint0Row) =>
    /tickets\.wired/.test(r.gate) && /docs\.wired/.test(r.gate);

  const stories = [];
  let closed = 0;
  for (const [i, r] of rows.entries()) {
    const acceptance = `Done: ${r.gate}${r.workflow.startsWith("/") ? ` · via ${r.workflow}` : ""}`;
    const role = normTeamRole(r.owner) ?? "delivery-manager";
    const done = isConnectSystems(r);
    let id = `${epicId}-s${i + 1}`;
    if (jira && inJira) {
      const issue = await createIssue(jira, {
        type: "Story", summary: r.ticket, description: acceptance, parentKey: epicId, labels: [role],
      });
      if (issue?.key) {
        id = issue.key;
        // Transition rather than create-as-Done: Jira has no "create in status" for a workflow's
        // terminal state. A board without a Done transition just leaves it open — honest, not fatal.
        if (done && await transitionIssue(jira, id, STATUS.done)) closed++;
      }
    } else if (done) {
      closed++;
    }
    stories.push({ id, epic_id: epicId, title: r.ticket, assignee: "—",
                   status: done ? "done" : "idle",
                   estimate_pts: 0, ac_pass_pct: done ? 100 : 0, acceptance, role });
  }
  await sb.from("story").insert(stories);
  return { created: stories.length, jira: inJira, closed };
}

export type PhaseAResult =
  | { ok: true; sprint0: number; jira: boolean; closed: number }
  | { ok: false; error: string; readiness: Readiness };

/**
 * Close Phase A: assert the engagement is actually provisioned, THEN materialize Sprint 0.
 *
 * Order is the whole point. Provisioning stores credentials; it does not prove they work. Cutting
 * the backlog before the probe means creating tickets against unverified Jira — and since
 * createSprint0 is idempotent, a silent fall back to local ids could never repair itself on a
 * re-check. Readiness first, tickets after: the tracker starts being used at the moment it is
 * known to work, and ticket 1 is already satisfied by the proof.
 */
export async function completePhaseA(engagementId: string): Promise<PhaseAResult> {
  const sb = supabaseAdmin();
  const readiness = await engagementReadiness(engagementId);
  if (!sb) return { ok: false, error: "Supabase not configured", readiness };
  if (!readiness.ok) return { ok: false, error: readinessRefusal(readiness), readiness };

  const s0 = await createSprint0(sb, engagementId);
  // Phase A is configuration and is now asserted complete; delivery work is what follows.
  await sb.from("engagement").update({ phase: "Delivery · Sprint 0" }).eq("id", engagementId);
  return { ok: true, sprint0: s0.created, jira: s0.jira, closed: s0.closed };
}
