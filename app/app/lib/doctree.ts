import { supabaseAdmin } from "./supabase";
import { resolveGraphCreds, resolveSite, defaultDrive, ensureFolder, ensureFile, safeName } from "./graph";

// The fixed Confluence folder structure — identical for every engagement (00–05).
export type DocNode = { path: string; title: string; kind: "folder" | "doc" | "template"; parent: string };

export const DOC_TREE: DocNode[] = [
  { path: "00-overview", title: "00 · Overview", kind: "doc", parent: "" },
  { path: "01-foundation", title: "01 · Foundation", kind: "folder", parent: "" },
  { path: "01-foundation/product-brief", title: "Product brief", kind: "doc", parent: "01-foundation" },
  { path: "01-foundation/foundational-architecture", title: "Foundational architecture", kind: "doc", parent: "01-foundation" },
  { path: "01-foundation/ways-of-working", title: "Ways of working", kind: "doc", parent: "01-foundation" },
  { path: "02-scope", title: "02 · Scope & SOW", kind: "folder", parent: "" },
  { path: "02-scope/sow", title: "SOW (source)", kind: "doc", parent: "02-scope" },
  { path: "02-scope/deliverables", title: "Deliverables (guardrails)", kind: "doc", parent: "02-scope" },
  { path: "03-delivery", title: "03 · Delivery", kind: "folder", parent: "" },
  { path: "03-delivery/briefs", title: "Briefs", kind: "folder", parent: "03-delivery" },
  { path: "03-delivery/architecture", title: "Architecture", kind: "folder", parent: "03-delivery" },
  { path: "04-governance", title: "04 · Governance", kind: "folder", parent: "" },
  { path: "04-governance/decisions", title: "Decisions (DRI log)", kind: "doc", parent: "04-governance" },
  { path: "04-governance/change-requests", title: "Change requests", kind: "doc", parent: "04-governance" },
  { path: "04-governance/status", title: "Status & checkpoints", kind: "doc", parent: "04-governance" },
  { path: "05-cadence", title: "05 · Cadence & ceremonies", kind: "folder", parent: "" },
  { path: "05-cadence/sprint-reviews", title: "Sprint reviews / demos", kind: "folder", parent: "05-cadence" },
  { path: "05-cadence/sprint-reviews/template", title: "Sprint review — template", kind: "template", parent: "05-cadence/sprint-reviews" },
  { path: "05-cadence/retros", title: "Retros", kind: "folder", parent: "05-cadence" },
  { path: "05-cadence/standups", title: "Standup notes", kind: "folder", parent: "05-cadence" },
];

// The sprint-review / demo template (⚡ = auto-filled from Supabase/Jira at generation time).
export const SPRINT_REVIEW_TEMPLATE = `<h1>Sprint {N} — Review &amp; Demo</h1>
<p><strong>Date:</strong> {date} &middot; <strong>Sprint goal:</strong> {goal}</p>
<h2>⚡ Delivered this sprint</h2><p>{stories shipped, with PR/demo links}</p>
<h2>⚡ Four-pillar snapshot (vs SOW)</h2>
<ul><li>Cost — {spent}/{budget} ({pct}%)</li><li>Scope — {deliverables grounded} · {CRs} pending</li>
<li>Time — {milestone} · {stories late} late</li><li>Quality — {AC pass}% · {criticals} criticals</li></ul>
<h2>Demo notes &amp; client feedback</h2><p></p>
<h2>⚡ Change requests raised</h2><p>{CRs this sprint}</p>
<h2>Decisions &amp; action items</h2><p></p>
<h2>⚡ Next sprint focus</h2><p>{top ready + tech-ready backlog}</p>`;

function content(node: DocNode, eng: { name: string; sow: string }) {
  if (node.kind === "template") return SPRINT_REVIEW_TEMPLATE;
  if (node.path === "02-scope/sow") return `<p><strong>${eng.sow}</strong> — ${eng.name}. Source SOW filed here on intake.</p>`;
  if (node.path === "02-scope/deliverables") return `<p>The SOW deliverables (D1…Dn) — the scope guardrail. Tracked live in Compass; mirrored here.</p>`;
  return `<p>${node.title} — scaffolded by Compass intake for ${eng.name}.</p>`;
}

type Eng = { id: string; name: string; sow: string; docs_provider?: string;
  confluence_space?: string; confluence_root_page_id?: string;
  atlassian_base_url?: string; atlassian_email?: string; atlassian_api_token?: string;
  teams_site?: string; teams_root_item_id?: string;
  graph_tenant_id?: string; graph_client_id?: string; graph_client_secret?: string };

function row(eng: Eng, node: DocNode, provider: string, extId: string | null, url: string | null, ord: number, status: string) {
  return {
    id: `${eng.id}-${node.path.replace(/\//g, "-")}`, engagement_id: eng.id,
    path: node.path, title: node.title, kind: node.kind, parent_path: node.parent,
    provider, external_id: extId, external_url: url,
    confluence_page_id: provider === "confluence" ? extId : null,
    confluence_url: provider === "confluence" ? url : null,
    status, ord,
  };
}

// Confluence provider — every node is a page (Confluence has no folders). Find-or-create by
// title within the space, so re-scaffolding reuses existing pages instead of 409-ing on dupes.
async function buildConfluence(eng: Eng): Promise<Record<string, unknown>[]> {
  const space = eng.confluence_space;
  const base = eng.atlassian_base_url || process.env.ATLASSIAN_BASE_URL;
  const email = eng.atlassian_email || process.env.ATLASSIAN_EMAIL;
  const token = eng.atlassian_api_token || process.env.ATLASSIAN_API_TOKEN;
  const canCreate = Boolean(space && base && email && token);
  const auth = canCreate ? Buffer.from(`${email}:${token}`).toString("base64") : "";
  const headers = { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" };

  async function ensurePage(title: string, parentId: string | null, html: string): Promise<{ id: string; url: string } | null> {
    try {
      const q = await fetch(`${base}/wiki/rest/api/content?spaceKey=${encodeURIComponent(space!)}&title=${encodeURIComponent(title)}&limit=1`, { headers });
      if (q.ok) { const p = (await q.json()).results?.[0]; if (p) return { id: p.id, url: `${base}/wiki${p._links?.webui ?? ""}` }; }
      const res = await fetch(`${base}/wiki/rest/api/content`, {
        method: "POST", headers,
        body: JSON.stringify({ type: "page", title, space: { key: space }, ...(parentId ? { ancestors: [{ id: parentId }] } : {}), body: { storage: { value: html, representation: "storage" } } }),
      });
      if (res.ok) { const j = await res.json(); return { id: j.id, url: `${base}/wiki${j._links?.webui ?? ""}` }; }
    } catch { /* pending */ }
    return null;
  }

  const rows: Record<string, unknown>[] = [];
  const idByPath: Record<string, string> = {};
  for (const node of DOC_TREE) {
    let id: string | null = null, url: string | null = null, status = "pending";
    if (canCreate) {
      const parentId = node.parent ? idByPath[node.parent] : (eng.confluence_root_page_id || null);
      const r = await ensurePage(`${eng.name} — ${node.title}`, parentId, content(node, eng));
      if (r) { id = r.id; url = r.url; idByPath[node.path] = r.id; status = "created"; }
    }
    rows.push(row(eng, node, "confluence", id, url, rows.length, status));
  }
  return rows;
}

// Teams provider — folder nodes → SharePoint folders, doc/template nodes → .html files, in the
// Team's default document library via Microsoft Graph. Find-or-create folders + PUT files = idempotent.
async function buildTeams(eng: Eng): Promise<Record<string, unknown>[]> {
  let driveId = "", engRoot = eng.teams_root_item_id || "root", live = false;
  const creds = resolveGraphCreds(eng);
  if (creds && eng.teams_site) {
    try {
      const siteId = await resolveSite(creds, eng.teams_site);
      driveId = await defaultDrive(creds, siteId);
      const r = await ensureFolder(creds, driveId, engRoot, safeName(eng.name)); // one folder per engagement
      engRoot = r.id; live = true;
    } catch { live = false; }
  }

  const rows: Record<string, unknown>[] = [];
  const idByPath: Record<string, string> = {};
  for (const node of DOC_TREE) {
    let id: string | null = null, url: string | null = null, status = "pending";
    if (live) {
      try {
        const parent = node.parent ? idByPath[node.parent] : engRoot;
        if (parent && creds) {
          const r = node.kind === "folder"
            ? await ensureFolder(creds, driveId, parent, safeName(node.title))
            : await ensureFile(creds, driveId, parent, `${safeName(node.title)}.html`, content(node, eng));
          id = r.id; url = r.url; status = "created";
          if (node.kind === "folder") idByPath[node.path] = r.id;
        }
      } catch { /* pending */ }
    }
    rows.push(row(eng, node, "teams", id, url, rows.length, status));
  }
  return rows;
}

// Scaffold the fixed doc tree for an engagement into its chosen provider (Confluence or Teams/
// SharePoint). Records every node in `doc_page`; creates for real when the provider is reachable,
// else marks nodes `pending`. Idempotent — safe to re-run.
export async function scaffoldDocs(engagementId: string) {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "no db" };
  const { data: eng } = await sb.from("engagement").select("*").eq("id", engagementId).maybeSingle();
  if (!eng) return { ok: false, error: "no engagement" };

  const provider = eng.docs_provider === "teams" ? "teams" : "confluence";
  const rows = provider === "teams" ? await buildTeams(eng) : await buildConfluence(eng);

  await sb.from("doc_page").delete().eq("engagement_id", engagementId);
  await sb.from("doc_page").insert(rows);
  const created = rows.filter((r) => r.status === "created").length;
  return { ok: true, provider, nodes: rows.length, created, pending: rows.length - created };
}
