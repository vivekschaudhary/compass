// Jira (Atlassian REST v3) write-path — the consolidation target: bets → Epics, stories →
// Stories under the Epic (team-managed `parent` link), build/fix → status transitions.
// Per-engagement creds win; fall back to the server .env. Returns null if incomplete.
import { supabaseAdmin } from "./supabase";
import { decryptSecret } from "./crypto";

export type JiraCreds = { baseUrl: string; email: string; token: string; project: string };

export function resolveJira(eng: {
  atlassian_base_url?: string; atlassian_email?: string; atlassian_api_token?: string; jira_project?: string;
}): JiraCreds | null {
  const baseUrl = eng.atlassian_base_url || process.env.ATLASSIAN_BASE_URL || "";
  const email = eng.atlassian_email || process.env.ATLASSIAN_EMAIL || "";
  // stored credentials are encrypted at rest; legacy plaintext passes through unchanged
  const token = decryptSecret(eng.atlassian_api_token) || process.env.ATLASSIAN_API_TOKEN || "";
  const project = eng.jira_project || process.env.JIRA_PROJECT || "";
  return baseUrl && email && token && project ? { baseUrl, email, token, project } : null;
}

function authHeader(c: JiraCreds) { return "Basic " + Buffer.from(`${c.email}:${c.token}`).toString("base64"); }

// v3 wants rich text as Atlassian Document Format, not a plain string.
//
// Headings and bullets are rendered as NODES rather than left as text. Every block used to become a
// `paragraph`, which is fine for the one-line bodies this file used to send and unreadable for a
// composed ticket: its "## What this is" arrived as the literal characters `## What this is`, and a
// five-point list arrived as one run-on paragraph of hyphens. A reader on the board cannot skim
// that, which defeats the point of composing it.
//
// Deliberately three block types and no more. This is not a markdown renderer — it is the small
// subset the ticket contract actually emits, and anything else stays plain text rather than being
// half-parsed into something that looks like a bug.
type AdfNode = Record<string, unknown>;

export function adf(text: string) {
  const content: AdfNode[] = [];
  let bullets: string[] = [];
  // Whether the last block is a paragraph still taking lines. A blank line closes it — without
  // this, "First.\n\nSecond." joins into one paragraph and every blank line in a composed body is
  // silently discarded.
  let openParagraph = false;

  // Bullets accumulate across lines, so the list is one node rather than one node per item.
  const flush = () => {
    if (!bullets.length) return;
    content.push({
      type: "bulletList",
      content: bullets.map((b) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: b }] }],
      })),
    });
    bullets = [];
  };

  for (const raw of (text || " ").split("\n")) {
    const line = raw.trimEnd();

    // `#+`, not `#{1,6}`: seven hashes is still a heading someone typed, and bounding the pattern
    // instead of the level would drop it into a paragraph as literal hashes — the exact rendering
    // failure this function exists to fix. The LEVEL is clamped below, where ADF's limit applies.
    const heading = line.match(/^(#+)\s+(.*)$/);
    if (heading && heading[2].trim()) {
      flush();
      openParagraph = false;
      content.push({
        type: "heading",
        attrs: { level: Math.min(heading[1].length, 6) },
        content: [{ type: "text", text: heading[2].trim() }],
      });
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet && bullet[1].trim()) {
      openParagraph = false;
      bullets.push(bullet[1].trim());
      continue;
    }

    flush();
    if (!line.trim()) { openParagraph = false; continue; }   // a blank line separates blocks
    // Consecutive prose lines join into one paragraph, so a wrapped sentence is not three paragraphs.
    if (openParagraph) {
      const runs = content[content.length - 1].content as { text: string }[];
      runs[0].text += ` ${line.trim()}`;
      continue;
    }
    content.push({ type: "paragraph", content: [{ type: "text", text: line.trim() }] });
    openParagraph = true;
  }
  flush();

  // ADF rejects an empty doc, and a body that came in blank must still produce a valid document
  // rather than a 400 the caller reads as "Jira refused the ticket".
  if (!content.length) content.push({ type: "paragraph", content: [{ type: "text", text: " " }] });
  return { type: "doc", version: 1, content };
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

// Rewrite an existing issue's summary and/or description.
//
// The counterpart `createIssue` never had: everything this file could do to an issue after creation
// was move it, comment on it or delete it, so a ticket created with a placeholder body was stuck
// with it. Composed bodies are written here, after the ticket exists.
//
// Nothing is sent when neither field is given — a PUT with empty `fields` is a wasted round trip
// that Jira answers 400, which would read as a refusal rather than as "there was nothing to say".
// `labels` and `assignee` are how a story joins a sprint and gets an owner. Labels go through the
// `update` verb rather than `fields`, and that is not a style choice: `fields.labels` REPLACES the
// whole list, so writing `sprint-3` that way would silently delete every label the client's own
// team put on the ticket. `update.labels[].add` is additive and a duplicate add is a no-op — which
// is what lets the sprint mirror re-run safely with no local bookkeeping to say what it did last
// time.
export async function updateIssue(
  c: JiraCreds, key: string,
  opts: {
    summary?: string; description?: string;
    labels?: string[];
    /** Null clears the assignee; undefined leaves it alone. */
    assignee?: { accountId: string } | null;
  },
): Promise<boolean> {
  const fields: Record<string, unknown> = {};
  if (opts.summary) fields.summary = opts.summary.slice(0, 240);
  if (opts.description) fields.description = adf(opts.description);
  if (opts.assignee !== undefined) fields.assignee = opts.assignee;

  const update: Record<string, unknown> = {};
  const labels = (opts.labels ?? []).map((l) => l.trim().replace(/\s+/g, "-")).filter(Boolean);
  if (labels.length) update.labels = labels.map((l) => ({ add: l }));

  const body: Record<string, unknown> = {};
  if (Object.keys(fields).length) body.fields = fields;
  if (Object.keys(update).length) body.update = update;
  if (!Object.keys(body).length) return false;

  const res = await jreq(c, `/issue/${key}`, { method: "PUT", body: JSON.stringify(body) });
  return res.ok;
}

// The one Jira user matching a name, or null.
//
// AMBIGUITY RETURNS NULL, and that is the point of `maxResults=2`. Two people called "A. Sharma"
// means picking the first assigns a real ticket on a real board to the wrong human — worse than
// leaving it unassigned with the problem written down, because an unassigned ticket gets noticed
// and a wrongly-assigned one does not.
//
// The roster holds display names, not emails (`member.name`), so the query is a name. Jira matches
// `query` against display name and email both, so an engagement that later populates emails works
// through the same call with no change here.
export async function findUser(
  c: JiraCreds, query: string,
): Promise<{ accountId: string; displayName: string } | null> {
  const q = query.trim();
  if (!q) return null;
  const res = await jreq(c, `/user/search?query=${encodeURIComponent(q)}&maxResults=2`);
  if (!res.ok) return null;
  const found = (await res.json()) as { accountId?: string; displayName?: string }[];
  if (!Array.isArray(found) || found.length !== 1 || !found[0]?.accountId) return null;
  return { accountId: found[0].accountId, displayName: found[0].displayName ?? q };
}

/**
 * Issues matching a JQL query.
 *
 * NULL AND [] ARE DIFFERENT ANSWERS, and every caller depends on it: `null` means the question
 * could not be asked, `[]` means it was asked and matched nothing. A gate that collapses them
 * reports "no unassigned stories" when the truth is "nobody could look" — the exact false green
 * this repo keeps re-learning, where an aggregate over zero rows passes because there was nothing
 * to check.
 *
 * Paged to exhaustion. A first page that happens to be clean says nothing about the second.
 */
export async function searchIssues(
  c: JiraCreds, jql: string, fields: string[],
): Promise<{ key: string; fields: Record<string, unknown> }[] | null> {
  const out: { key: string; fields: Record<string, unknown> }[] = [];
  let token: string | undefined;

  // Bounded: a runaway cursor must not spin forever against a client's Jira.
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ jql, fields: fields.join(","), maxResults: "100" });
    if (token) qs.set("nextPageToken", token);
    const res = await jreq(c, `/search/jql?${qs.toString()}`);
    if (!res.ok) return null;
    const body = (await res.json()) as {
      issues?: { key: string; fields?: Record<string, unknown> }[];
      nextPageToken?: string;
    };
    for (const i of body.issues ?? []) out.push({ key: i.key, fields: i.fields ?? {} });
    if (!body.nextPageToken) return out;
    token = body.nextPageToken;
  }
  return out;
}

// The issue's current status NAME, or null when it can't be read. Used to remember where a ticket
// was before a speculative transition, so it can be put back if the work never actually started
// (#123 — the orchestrator's pre-dispatch gates refuse before running anything).
// Every status name the project's issue types can reach. Used by the Phase A readiness check:
// `moveTo` degrades QUIETLY when a status isn't on the board — it logs "(skipped)" and the run
// carries on reporting success, so a missing "Awaiting HITL approval" column means every human
// gate silently fails to transition while the board looks fine. Better to assert it once at
// setup than to discover it after a client sees an ungated deliverable marked Done.
// Returns null when the project can't be read at all (auth/permission/not-found).
export async function projectStatuses(c: JiraCreds): Promise<string[] | null> {
  const r = await jreq(c, `/project/${c.project}/statuses`);
  if (!r.ok) return null;
  const body = await r.json().catch(() => null);
  if (!Array.isArray(body)) return null;
  const names = new Set<string>();
  for (const t of body) for (const s of t?.statuses ?? []) if (s?.name) names.add(String(s.name));
  return [...names];
}

export async function issueStatus(c: JiraCreds, key: string): Promise<string | null> {
  const r = await jreq(c, `/issue/${key}?fields=status`);
  if (!r.ok) return null;
  const name = (await r.json())?.fields?.status?.name;
  return typeof name === "string" ? name : null;
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

// Attach a URL to an issue as a Web link (the issue's "Web links" section). Idempotent via globalId
// (the url), so re-running a workflow updates the existing link instead of duplicating it.
export async function addRemoteLink(c: JiraCreds, key: string, url: string, title: string): Promise<boolean> {
  const body = { globalId: url, object: { url, title } };
  const res = await jreq(c, `/issue/${key}/remotelink`, { method: "POST", body: JSON.stringify(body) });
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
