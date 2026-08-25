// Provider-agnostic doc read/write — reuses the two-provider layer (Confluence REST · Teams Graph)
// so the research workflow can read the product brief and draft the research doc back into whichever
// provider the engagement uses. Per-engagement creds win, env fallback (same as scaffold).
import { resolveGraphCreds, resolveSite, defaultDrive, ensureFolder, ensureFile, readFile, safeName, deleteItem } from "./graph";
import { decryptSecret } from "./crypto";

export type DocEng = {
  id: string; name: string; docs_provider?: string;
  confluence_space?: string; confluence_root_page_id?: string;
  atlassian_base_url?: string; atlassian_email?: string; atlassian_api_token?: string;
  teams_site?: string; teams_root_item_id?: string;
  graph_tenant_id?: string; graph_client_id?: string; graph_client_secret?: string;
};

export function stripHtml(html: string): string {
  return (html || "")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

// ── Confluence ──
function cfAuth(eng: DocEng) {
  const base = eng.atlassian_base_url || process.env.ATLASSIAN_BASE_URL || "";
  const email = eng.atlassian_email || process.env.ATLASSIAN_EMAIL || "";
  const token = decryptSecret(eng.atlassian_api_token) || process.env.ATLASSIAN_API_TOKEN || "";
  if (!base || !email || !token) return null;
  return { base, headers: { Authorization: "Basic " + Buffer.from(`${email}:${token}`).toString("base64"), "Content-Type": "application/json", Accept: "application/json" } };
}

async function cfRead(eng: DocEng, pageId: string): Promise<string | null> {
  const a = cfAuth(eng); if (!a) return null;
  try {
    const res = await fetch(`${a.base}/wiki/rest/api/content/${pageId}?expand=body.storage`, { headers: a.headers });
    if (!res.ok) return null;
    return stripHtml((await res.json()).body?.storage?.value ?? "");
  } catch { return null; }
}

async function cfWrite(eng: DocEng, title: string, html: string): Promise<{ id: string; url: string } | null> {
  const a = cfAuth(eng); const space = eng.confluence_space;
  // NOT configured is a different fact from REFUSED, and the caller reported them with one
  // sentence. A root page id belonging to another space produced "the provider is not configured",
  // which sent the reader to check credentials that were fine. Null means unconfigured; a refusal
  // throws, carrying what Confluence actually said.
  if (!a || !space) return null;
  const full = `${eng.name} — ${title}`;
  try {
    const q = await fetch(`${a.base}/wiki/rest/api/content?spaceKey=${encodeURIComponent(space)}&title=${encodeURIComponent(full)}&limit=1`, { headers: a.headers });
    const existing = q.ok ? (await q.json()).results?.[0] : null;
    if (existing) {
      const cur = await fetch(`${a.base}/wiki/rest/api/content/${existing.id}?expand=version`, { headers: a.headers });
      const ver = cur.ok ? ((await cur.json()).version?.number ?? 1) : 1;
      const res = await fetch(`${a.base}/wiki/rest/api/content/${existing.id}`, {
        method: "PUT", headers: a.headers,
        body: JSON.stringify({ id: existing.id, type: "page", title: full, space: { key: space }, version: { number: ver + 1 }, body: { storage: { value: html, representation: "storage" } } }),
      });
      if (res.ok) { const j = await res.json(); return { id: j.id, url: `${a.base}/wiki${j._links?.webui ?? ""}` }; }
      return { id: existing.id, url: `${a.base}/wiki${existing._links?.webui ?? `/spaces/${space}/pages/${existing.id}`}` };
    }
    const res = await fetch(`${a.base}/wiki/rest/api/content`, {
      method: "POST", headers: a.headers,
      body: JSON.stringify({ type: "page", title: full, space: { key: space }, ...(eng.confluence_root_page_id ? { ancestors: [{ id: eng.confluence_root_page_id }] } : {}), body: { storage: { value: html, representation: "storage" } } }),
    });
    if (res.ok) { const j = await res.json(); return { id: j.id, url: `${a.base}/wiki${j._links?.webui ?? ""}` }; }

    // Confluence's own words. Its 400s are specific and actionable — "Can't add a parent from
    // another space" names the exact field that is wrong — and swallowing them cost an evening.
    const body = await res.text().catch(() => "");
    let detail = body.slice(0, 300);
    try { detail = JSON.parse(body).message ?? detail; } catch { /* not json — keep the raw text */ }
    throw new Error(`Confluence refused (${res.status}): ${detail}`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Confluence refused")) throw e;
    throw new Error(`Could not reach Confluence: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── Teams / SharePoint ──
async function teamsWrite(eng: DocEng, title: string, html: string): Promise<{ id: string; url: string } | null> {
  const creds = resolveGraphCreds(eng);
  if (!creds || !eng.teams_site) return null;
  try {
    const siteId = await resolveSite(creds, eng.teams_site);
    const driveId = await defaultDrive(creds, siteId);
    const root = await ensureFolder(creds, driveId, eng.teams_root_item_id || "root", safeName(eng.name));
    return await ensureFile(creds, driveId, root.id, `${safeName(title)}.html`, html);
  } catch { return null; }
}

async function teamsRead(eng: DocEng, itemId: string): Promise<string | null> {
  const creds = resolveGraphCreds(eng);
  if (!creds || !eng.teams_site) return null;
  try {
    const siteId = await resolveSite(creds, eng.teams_site);
    const driveId = await defaultDrive(creds, siteId);
    return stripHtml(await readFile(creds, driveId, itemId));
  } catch { return null; }
}

// Can we actually reach the configured docs destination? A READ probe, not a write — the
// readiness check must not litter the client's space with test pages. Returns null when it
// is reachable, else a human-readable reason. Phase A asserts this; every workflow after it
// assumes a doc can land, and `writeProviderDoc` returning null is otherwise indistinguishable
// from "not configured" at the point where the work is already done.
export async function probeDocs(eng: DocEng): Promise<string | null> {
  if (eng.docs_provider === "teams") {
    if (!eng.teams_site) return "no Teams/SharePoint site configured";
    const creds = resolveGraphCreds(eng);
    if (!creds) return "no Graph credentials (tenant id / client id / client secret)";
    try {
      await resolveSite(creds, eng.teams_site);
      return null;
    } catch (e) { return `could not reach the Teams site — ${e instanceof Error ? e.message : "error"}`; }
  }
  const a = cfAuth(eng);
  if (!a) return "no Atlassian credentials (base url / email / token)";
  if (!eng.confluence_space) return "no Confluence space configured";
  try {
    const res = await fetch(`${a.base}/wiki/rest/api/space/${encodeURIComponent(eng.confluence_space)}`, { headers: a.headers });
    if (res.status === 404) return `space "${eng.confluence_space}" not found`;
    if (res.status === 401 || res.status === 403) return `no access to space "${eng.confluence_space}" (HTTP ${res.status})`;
    return res.ok ? null : `space check failed (HTTP ${res.status})`;
  } catch (e) { return `could not reach Confluence — ${e instanceof Error ? e.message : "network error"}`; }
}

/**
 * Permanently remove a page. Returns true when it is gone (or was already).
 *
 * Confluence needs TWO calls. A bare DELETE returns 204 but only moves the page to TRASH — it
 * still resolves, still holds the content, and still occupies its title in the space, so a
 * "deleted" page silently blocks recreating one with the same name. `?purge=true` is what
 * actually removes it, and only works once the page is trashed. Verified by hand: 20 pages that
 * had returned 204 were all still readable with status "trashed".
 */
async function cfDelete(eng: DocEng, pageId: string): Promise<boolean> {
  const a = cfAuth(eng);
  if (!a) return false;
  try {
    await fetch(`${a.base}/wiki/api/v2/pages/${pageId}`, { method: "DELETE", headers: a.headers });
    await fetch(`${a.base}/wiki/api/v2/pages/${pageId}?purge=true`, { method: "DELETE", headers: a.headers });
    const check = await fetch(`${a.base}/wiki/api/v2/pages/${pageId}`, { headers: a.headers });
    return check.status === 404;                 // gone means GONE, not "we sent a request"
  } catch { return false; }
}

async function teamsDelete(eng: DocEng, itemId: string): Promise<boolean> {
  const creds = resolveGraphCreds(eng);
  if (!creds || !eng.teams_site) return false;
  try {
    const siteId = await resolveSite(creds, eng.teams_site);
    const driveId = await defaultDrive(creds, siteId);
    return await deleteItem(creds, driveId, itemId);
  } catch { return false; }
}

// ── Public: dispatch by the engagement's docs provider ──

/** Delete a doc from whichever provider this engagement uses. Used by test teardown, where the
 *  database cascade alone would leave real pages orphaned in a real space. */
export async function deleteProviderDoc(
  eng: DocEng, doc: { provider?: string | null; external_id?: string | null },
): Promise<boolean> {
  if (!doc.external_id) return true;                       // nothing was ever created
  return eng.docs_provider === "teams" ? teamsDelete(eng, doc.external_id) : cfDelete(eng, doc.external_id);
}

/**
 * Check a Confluence space key, and say what to type when it is wrong.
 *
 * It used to CORRECT the value — `Test` became `Test1` and intake reported the change. That is a
 * silent rewrite of something a person entered, and it read as a failure precisely because it was
 * confusing: the app decided what you meant. It now refuses and names the candidate, so the value
 * stored is the one you typed and the correction is yours to make.
 *
 * Returns null when the key is good, or a sentence saying what to use instead.
 *
 * CASE IS NOT A MISMATCH. Confluence resolves a space key in any casing — `GET /space/test1`,
 * `/Test1` and `/TEST1` all answer 200 — so refusing on case alone rejected a key that would have
 * worked, and this check was stricter than the API it guards. Matching case-insensitively is not
 * the rewrite described above: it returns the same identifier the person named. Substituting a
 * space's NAME for its key is a different string and a guess about intent, so that still refuses.
 */
export async function checkSpaceKey(eng: DocEng, given: string): Promise<string | null> {
  const a = cfAuth(eng);
  if (!a || !given) return null;      // not configured is a different problem, reported elsewhere
  try {
    const res = await fetch(`${a.base}/wiki/rest/api/space?limit=200`, { headers: a.headers });
    if (!res.ok) return null;         // cannot check is not the same as wrong
    const spaces: { key: string; name: string }[] = (await res.json()).results ?? [];

    const want = given.trim().toLowerCase();
    if (spaces.some((sp) => sp.key?.toLowerCase() === want)) return null;

    // The name/key distinction is the one people actually hit: Confluence shows "Test" and the
    // API wants "Test1", so say both.
    const near = spaces.find((sp) => sp.name?.trim().toLowerCase() === want);
    return near
      ? `No Confluence space with key '${given}'. Use '${near.key}' — that is the key of the space named '${near.name}'.`
      : `No Confluence space with key '${given}'. Check the key in Confluence — it is not the space's display name.`;
  } catch { return null; }
}

/**
 * The space key as Confluence spells it, for a key that differs only by case.
 *
 * Returns null when it cannot be resolved — the caller then stores what it was given, because
 * "could not check" must not silently change a value.
 */
export async function canonicalSpaceKey(eng: DocEng, given: string): Promise<string | null> {
  const a = cfAuth(eng);
  if (!a || !given) return null;
  try {
    const res = await fetch(`${a.base}/wiki/rest/api/space?limit=200`, { headers: a.headers });
    if (!res.ok) return null;
    const spaces: { key: string }[] = (await res.json()).results ?? [];
    const want = given.trim().toLowerCase();
    return spaces.find((sp) => sp.key?.toLowerCase() === want)?.key ?? null;
  } catch { return null; }
}

/**
 * The one spelling of a Jira project key that Atlassian will answer to.
 *
 * Uppercase is a PLATFORM INVARIANT, not a house style: Jira enforces it when the project is
 * created, so `test1` cannot denote a different project from `TEST1`. Applying it is therefore not
 * the silent rewrite `checkSpaceKey` refuses to do — there is no second candidate to guess between.
 *
 * It has to be applied at every point the key is STORED, not only where it is checked. The API is
 * case-sensitive (`GET /project/test1/statuses` → 404 where `TEST1` → 200), so a lowercase value
 * that passes intake fails every call afterwards: `projectStatuses` returns null, setup's `tickets`
 * criterion reads unsatisfied, and the machine row never closes. A stored value that the code
 * reading it cannot use is not fidelity to what someone typed, it is a delayed failure.
 */
export function canonicalProjectKey(given: string | null | undefined): string | null {
  const k = given?.trim().toUpperCase();
  return k ? k : null;
}

/** Check a Jira project key. Case is normalised first — see `canonicalProjectKey`. */
export async function checkProjectKey(eng: DocEng & { jira_project?: string }, given: string): Promise<string | null> {
  const a = cfAuth(eng);
  if (!a || !given) return null;
  try {
    const res = await fetch(`${a.base}/rest/api/3/project/search?maxResults=100`, { headers: a.headers });
    if (!res.ok) return null;
    const projects: { key: string; name: string }[] = (await res.json()).values ?? [];

    const want = canonicalProjectKey(given);
    if (projects.some((pr) => pr.key?.toUpperCase() === want)) return null;

    // No near-match branch survives normalisation: anything that differed only by case has already
    // matched above, so a miss here is a key that genuinely is not on this site. Naming the closest
    // project by NAME is the trap people actually hit now — the project named "Test1" has key
    // "TEST1", the same shape as the Confluence name/key confusion.
    const near = projects.find((pr) => pr.name?.trim().toLowerCase() === given.trim().toLowerCase());
    return near
      ? `No Jira project with key '${given}'. Use '${near.key}' — that is the key of the project named '${near.name}'.`
      : `No Jira project with key '${given}'. Check the key on the board — it is not the project's display name.`;
  } catch { return null; }
}

export async function writeProviderDoc(eng: DocEng, title: string, html: string): Promise<{ id: string; url: string } | null> {
  return eng.docs_provider === "teams" ? teamsWrite(eng, title, html) : cfWrite(eng, title, html);
}

export async function readProviderDoc(eng: DocEng, docRow: { provider?: string | null; external_id?: string | null }): Promise<string | null> {
  if (!docRow?.external_id) return null;
  const provider = docRow.provider || eng.docs_provider || "confluence";
  return provider === "teams" ? teamsRead(eng, docRow.external_id) : cfRead(eng, docRow.external_id);
}
