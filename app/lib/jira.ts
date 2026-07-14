// Jira (Atlassian REST v3) write-path — the consolidation target: bets → Epics, stories →
// Stories under the Epic (team-managed `parent` link), build/fix → status transitions.
// Per-engagement creds win; fall back to the server .env. Returns null if incomplete.
import { supabaseAdmin } from "./supabase";

export type JiraCreds = { baseUrl: string; email: string; token: string; project: string };

export function resolveJira(eng: {
  atlassian_base_url?: string; atlassian_email?: string; atlassian_api_token?: string; jira_project?: string;
}): JiraCreds | null {
  const baseUrl = eng.atlassian_base_url || process.env.ATLASSIAN_BASE_URL || "";
  const email = eng.atlassian_email || process.env.ATLASSIAN_EMAIL || "";
  const token = eng.atlassian_api_token || process.env.ATLASSIAN_API_TOKEN || "";
  const project = eng.jira_project || process.env.JIRA_PROJECT || "";
  return baseUrl && email && token && project ? { baseUrl, email, token, project } : null;
}

function authHeader(c: JiraCreds) { return "Basic " + Buffer.from(`${c.email}:${c.token}`).toString("base64"); }

// v3 wants rich text as Atlassian Document Format, not a plain string.
function adf(text: string) {
  const paras = (text || " ").split(/\n\n+/).map((p) => ({ type: "paragraph", content: [{ type: "text", text: p || " " }] }));
  return { type: "doc", version: 1, content: paras };
}

async function jreq(c: JiraCreds, path: string, init?: RequestInit) {
  return fetch(`${c.baseUrl}/rest/api/3${path}`, {
    ...init,
    headers: { Authorization: authHeader(c), "Content-Type": "application/json", Accept: "application/json", ...(init?.headers || {}) },
  });
}

// Create an issue. `type` is the issue-type name (Epic | Story | Task | Bug). For a Story
// under an Epic in a team-managed project, pass parentKey = the Epic key. `labels` mirror the
// story's owning role (single tokens, no spaces) so tickets are filterable by role in Jira.
export async function createIssue(c: JiraCreds, opts: { type: string; summary: string; description?: string; parentKey?: string; labels?: string[] }): Promise<{ key: string } | null> {
  const fields: Record<string, unknown> = { project: { key: c.project }, issuetype: { name: opts.type }, summary: opts.summary.slice(0, 240) };
  if (opts.description) fields.description = adf(opts.description);
  if (opts.parentKey) fields.parent = { key: opts.parentKey };
  const labels = (opts.labels ?? []).map((l) => l.trim().replace(/\s+/g, "-")).filter(Boolean);
  if (labels.length) fields.labels = labels;
  const res = await jreq(c, "/issue", { method: "POST", body: JSON.stringify({ fields }) });
  if (!res.ok) return null;
  return { key: (await res.json()).key };
}

// Move an issue to a target status by name (e.g. "In Progress", "Awaiting HITL approval", "Done").
// Honest about the outcome: returns true only if the issue actually ENDS UP in the target
// (transitioned, or already there); false if the status is unreachable — e.g. it hasn't been added
// to the board yet — so the caller can log an honest "(skipped)" instead of a false success.
export async function transitionIssue(c: JiraCreds, key: string, toStatus: string): Promise<boolean> {
  const want = toStatus.toLowerCase();
  // Already in the target? (the transitions list only shows OTHER reachable statuses, so we must
  // read the current status to distinguish "already there" from "status doesn't exist".)
  const cur = await jreq(c, `/issue/${key}?fields=status`);
  if (cur.ok) {
    const name = (await cur.json())?.fields?.status?.name;
    if (typeof name === "string" && name.toLowerCase() === want) return true;
  }
  const t = await jreq(c, `/issue/${key}/transitions`);
  if (!t.ok) return false;
  const list = (await t.json()).transitions ?? [];
  const tr = list.find((x: { to?: { name?: string } }) => x.to?.name?.toLowerCase() === want);
  if (!tr) return false; // target status not reachable from here (likely not on the board)
  const res = await jreq(c, `/issue/${key}/transitions`, { method: "POST", body: JSON.stringify({ transition: { id: tr.id } }) });
  return res.ok;
}

export async function addComment(c: JiraCreds, key: string, text: string): Promise<boolean> {
  const res = await jreq(c, `/issue/${key}/comment`, { method: "POST", body: JSON.stringify({ body: adf(text) }) });
  return res.ok;
}

export async function deleteIssue(c: JiraCreds, key: string): Promise<boolean> {
  const res = await jreq(c, `/issue/${key}?deleteSubtasks=true`, { method: "DELETE" });
  return res.ok;
}

// Resolve the Jira creds for a story's engagement (per-engagement → env). Used by build/fix
// to transition the issue as the orchestrator runs.
export async function jiraForStory(storyKey: string): Promise<JiraCreds | null> {
  const sb = supabaseAdmin();
  if (!sb) return resolveJira({});
  const { data: st } = await sb.from("story").select("epic_id").eq("id", storyKey).maybeSingle();
  if (!st?.epic_id) return resolveJira({});
  const { data: ep } = await sb.from("epic").select("engagement_id").eq("id", st.epic_id).maybeSingle();
  if (!ep?.engagement_id) return resolveJira({});
  const { data: eng } = await sb.from("engagement")
    .select("atlassian_base_url, atlassian_email, atlassian_api_token, jira_project")
    .eq("id", ep.engagement_id).maybeSingle();
  return resolveJira(eng ?? {});
}
