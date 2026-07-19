// Microsoft Graph (Teams / SharePoint) — client-credentials auth, per-engagement creds.
// Used to scaffold the fixed doc tree into a Team's SharePoint document library
// (the store behind a Team's "Files" tab), parallel to the Confluence provider.

export type GraphCreds = { tenantId: string; clientId: string; clientSecret: string };

// Per-engagement creds win; fall back to the server .env. Returns null if incomplete.
export function resolveGraphCreds(eng: { graph_tenant_id?: string; graph_client_id?: string; graph_client_secret?: string }): GraphCreds | null {
  const tenantId = eng.graph_tenant_id || process.env.GRAPH_TENANT_ID || "";
  const clientId = eng.graph_client_id || process.env.GRAPH_CLIENT_ID || "";
  const clientSecret = eng.graph_client_secret || process.env.GRAPH_CLIENT_SECRET || "";
  return tenantId && clientId && clientSecret ? { tenantId, clientId, clientSecret } : null;
}

const tokCache = new Map<string, { token: string; exp: number }>();

async function token(c: GraphCreds): Promise<string> {
  const key = `${c.tenantId}:${c.clientId}`;
  const hit = tokCache.get(key);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const body = new URLSearchParams({
    client_id: c.clientId, client_secret: c.clientSecret,
    scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${c.tenantId}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  if (!res.ok) throw new Error(`graph token ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const tok = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  tokCache.set(key, tok);
  return tok.token;
}

async function g(c: GraphCreds, path: string, init?: RequestInit) {
  const t = await token(c);
  return fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${t}`, Accept: "application/json", ...(init?.headers || {}) },
  });
}

// Resolve a site reference → site id. Accepts "host:/sites/Name" (Graph path form),
// a full webUrl "https://host/sites/Name", or a raw site id (returned as-is).
export async function resolveSite(c: GraphCreds, ref: string): Promise<string> {
  let path = ref.trim();
  const m = path.match(/^https?:\/\/([^/]+)\/(sites|teams)\/(.+?)\/?$/i);
  if (m) path = `${m[1]}:/${m[2]}/${m[3]}`;
  if (!path.includes(":") && !path.includes("/")) return path; // already an id
  const res = await g(c, `/sites/${encodeURI(path)}`);
  if (!res.ok) throw new Error(`resolveSite ${res.status}: ${await res.text()}`);
  return (await res.json()).id;
}

export async function defaultDrive(c: GraphCreds, siteId: string): Promise<string> {
  const res = await g(c, `/sites/${siteId}/drive?$select=id`);
  if (!res.ok) throw new Error(`drive ${res.status}: ${await res.text()}`);
  return (await res.json()).id;
}

// SharePoint/OneDrive item names can't contain \ / : * ? " < > | — sanitize.
const BAD = /[\\/:*?"<>|]+/g;
export function safeName(s: string) { return s.replace(BAD, "-").replace(/\s+/g, " ").trim(); }

// find-or-create a folder under parent (parent = "root" or an item id) → idempotent.
export async function ensureFolder(c: GraphCreds, driveId: string, parentId: string, name: string): Promise<{ id: string; url: string }> {
  const kids = await g(c, `/drives/${driveId}/items/${parentId}/children?$select=id,name,webUrl,folder&$top=200`);
  if (kids.ok) {
    const found = (await kids.json()).value?.find((k: { name: string; folder?: unknown; id: string; webUrl: string }) => k.name === name && k.folder);
    if (found) return { id: found.id, url: found.webUrl };
  }
  const res = await g(c, `/drives/${driveId}/items/${parentId}/children`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "replace" }),
  });
  if (!res.ok) throw new Error(`folder ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return { id: j.id, url: j.webUrl };
}

// read a file's raw content by item id.
export async function readFile(c: GraphCreds, driveId: string, itemId: string): Promise<string> {
  const res = await g(c, `/drives/${driveId}/items/${itemId}/content`);
  if (!res.ok) throw new Error(`readFile ${res.status}: ${await res.text()}`);
  return res.text();
}

// upload/replace a file's content under parent (PUT is idempotent by path).
export async function ensureFile(c: GraphCreds, driveId: string, parentId: string, name: string, html: string): Promise<{ id: string; url: string }> {
  const res = await g(c, `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(name)}:/content`, {
    method: "PUT", headers: { "Content-Type": "text/html" }, body: html,
  });
  if (!res.ok) throw new Error(`file ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return { id: j.id, url: j.webUrl };
}
