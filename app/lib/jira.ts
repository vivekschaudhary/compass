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
// under an Epic in a team-managed project, pass parentKey = the Epic key.
export async function createIssue(c: JiraCreds, opts: { type: string; summary: string; description?: string; parentKey?: string }): Promise<{ key: string } | null> {
  const fields: Record<string, unknown> = { project: { key: c.project }, issuetype: { name: opts.type }, summary: opts.summary.slice(0, 240) };
  if (opts.description) fields.description = adf(opts.description);
  if (opts.parentKey) fields.parent = { key: opts.parentKey };
  const res = await jreq(c, "/issue", { method: "POST", body: JSON.stringify({ fields }) });
  if (!res.ok) return null;
  return { key: (await res.json()).key };
}

// Move an issue to a target status by name (e.g. "In Progress", "Done"). No-op if already there.
export async function transitionIssue(c: JiraCreds, key: string, toStatus: string): Promise<boolean> {
  const t = await jreq(c, `/issue/${key}/transitions`);
  if (!t.ok) return false;
  const want = toStatus.toLowerCase();
  const list = (await t.json()).transitions ?? [];
  const tr = list.find((x: { to?: { name?: string } }) => x.to?.name?.toLowerCase() === want);
  if (!tr) return true; // already in that status (no transition offered) — treat as success
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
