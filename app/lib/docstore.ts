// Provider-agnostic doc read/write — reuses the two-provider layer (Confluence REST · Teams Graph)
// so the research workflow can read the product brief and draft the research doc back into whichever
// provider the engagement uses. Per-engagement creds win, env fallback (same as scaffold).
import { resolveGraphCreds, resolveSite, defaultDrive, ensureFolder, ensureFile, readFile, safeName } from "./graph";

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
  const token = eng.atlassian_api_token || process.env.ATLASSIAN_API_TOKEN || "";
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
  } catch { /* fall through */ }
  return null;
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

// ── Public: dispatch by the engagement's docs provider ──
export async function writeProviderDoc(eng: DocEng, title: string, html: string): Promise<{ id: string; url: string } | null> {
  return eng.docs_provider === "teams" ? teamsWrite(eng, title, html) : cfWrite(eng, title, html);
}

export async function readProviderDoc(eng: DocEng, docRow: { provider?: string | null; external_id?: string | null }): Promise<string | null> {
  if (!docRow?.external_id) return null;
  const provider = docRow.provider || eng.docs_provider || "confluence";
  return provider === "teams" ? teamsRead(eng, docRow.external_id) : cfRead(eng, docRow.external_id);
}
