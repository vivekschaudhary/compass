"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Connectors, RepoRef, RepoArea, DocsProvider, TeamMember, COMPASS_ROLES } from "@/app/lib/data";

const AREAS: RepoArea[] = ["frontend", "backend", "qa-automation", "infra", "mobile", "shared"];
const ROLE_OPTIONS = COMPASS_ROLES;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

function Input({ label, value, onChange, placeholder, mono, type }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; type?: string }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type ?? "text"} autoComplete="off"
        className={`mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand ${mono ? "mono" : ""}`} />
    </label>
  );
}

// A write-only secret field: never pre-filled. Shows whether one is already stored.
function Secret({ label, value, onChange, isSet }: { label: string; value: string; onChange: (v: string) => void; isSet: boolean }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}
        {isSet && <span className="ml-1.5 rounded-pill bg-good-weak px-1.5 py-0.5 text-[9.5px] font-medium text-good">set</span>}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} type="password" autoComplete="new-password"
        placeholder={isSet ? "•••••••••••• — leave blank to keep" : "paste secret"}
        className="mono mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
    </label>
  );
}

type DocRow = { path: string; title: string; kind: string; status: string; url: string | null };

export function SettingsForm({ engagementId, engagementName, initialConnectors, initialRepos, initialDocs, initialMembers }: {
  engagementId: string; engagementName: string; initialConnectors: Connectors; initialRepos: RepoRef[]; initialDocs: DocRow[]; initialMembers: TeamMember[];
}) {
  const router = useRouter();
  const [c, setC] = useState<Connectors>(initialConnectors);
  const [atlassianToken, setAtlassianToken] = useState("");
  const [graphSecret, setGraphSecret] = useState("");
  const [repos, setRepos] = useState<RepoRef[]>(initialRepos.length ? initialRepos : []);
  const [team, setTeam] = useState<TeamMember[]>(initialMembers);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [scaffolding, setScaffolding] = useState(false);

  function addMember() {
    setTeam([...team, { id: "", role: "eng", name: "", initials: "", title: "", start_date: "", end_date: "", comments: "" }]);
  }
  function updateMember(i: number, patch: Partial<TeamMember>) { setTeam(team.map((m, j) => (j === i ? { ...m, ...patch } : m))); }
  function removeMember(i: number) { setTeam(team.filter((_, j) => j !== i)); }

  async function scaffold() {
    setScaffolding(true);
    await fetch("/api/scaffold", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engagementId }) });
    router.refresh();
    setScaffolding(false);
  }
  const set = (k: keyof Connectors) => (v: string) => setC({ ...c, [k]: v });

  function addRepo() {
    setRepos([...repos, { id: "", key: "", name: "", url: "", area: "frontend", default_branch: "main", local_path: "", build_cmd: "", test_cmd: "" }]);
  }
  function updateRepo(i: number, patch: Partial<RepoRef>) { setRepos(repos.map((r, j) => (j === i ? { ...r, ...patch } : r))); }
  function removeRepo(i: number) { setRepos(repos.filter((_, j) => j !== i)); }

  async function save() {
    setState("saving");
    const connectors = { ...c, atlassian_api_token: atlassianToken || undefined, graph_client_secret: graphSecret || undefined };
    const members = team.filter((m) => m.name.trim()).map((m) => ({ ...m, initials: m.initials.trim() || initials(m.name) }));
    await fetch("/api/connectors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engagementId, connectors, repos, members }) });
    setAtlassianToken(""); setGraphSecret(""); // clear secret inputs after save
    setState("saved");
    router.refresh();
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <div className="min-h-screen bg-shell">
      <header className="flex items-center justify-between border-b border-line bg-card px-6 py-4">
        <div>
          <div className="text-[14.5px] font-semibold text-ink">Settings — {engagementName}</div>
          <div className="text-[11px] text-faint">Connectors: code · design · docs · tracker</div>
        </div>
        <div className="flex items-center gap-3">
          {state === "saved" && <span className="text-[12.5px] font-medium text-good">✓ Saved</span>}
          <button onClick={save} disabled={state === "saving"} className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40">{state === "saving" ? "Saving…" : "Save"}</button>
          <a href="/" className="text-[13px] font-medium text-muted hover:text-ink">← Dashboard</a>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8 space-y-4">
        {/* connectors */}
        <section className="rounded-card border border-line bg-card p-5">
          <h2 className="text-[15px] font-semibold text-ink">Connectors</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">Design source, docs store, and tracker for this engagement.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input label="Figma file / project" value={c.figma_url} onChange={set("figma_url")} placeholder="https://figma.com/file/…" mono />
            <div />
          </div>

          {/* doc-storage provider — Confluence or Teams/SharePoint */}
          <div className="mt-5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Doc storage</span>
            <div className="mt-1.5 inline-flex rounded-lg border border-line bg-shell/40 p-0.5">
              {(["confluence", "teams"] as DocsProvider[]).map((p) => (
                <button key={p} onClick={() => setC({ ...c, docs_provider: p })}
                  className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium ${c.docs_provider === p ? "bg-card text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"}`}>
                  {p === "confluence" ? "Confluence" : "Teams / SharePoint"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {c.docs_provider === "confluence" ? (
              <>
                <Input label="Confluence space key" value={c.confluence_space} onChange={set("confluence_space")} placeholder="ACME" mono />
                <Input label="Confluence root page id" value={c.confluence_root_page_id} onChange={set("confluence_root_page_id")} placeholder="(set by Scaffold)" mono />
                <Input label="Atlassian base URL" value={c.atlassian_base_url} onChange={set("atlassian_base_url")} placeholder="https://acme.atlassian.net" mono />
                <Input label="Atlassian email" value={c.atlassian_email} onChange={set("atlassian_email")} placeholder="you@acme.com" mono />
                <div className="sm:col-span-2">
                  <Secret label="Atlassian API token" value={atlassianToken} onChange={setAtlassianToken} isSet={c.has_atlassian_token} />
                  <p className="mt-1 text-[11px] text-faint">This client&apos;s Confluence credentials. Leave URL/email/token blank to fall back to the server <span className="mono">.env</span>.</p>
                </div>
              </>
            ) : (
              <>
                <div className="sm:col-span-2">
                  <Input label="SharePoint site" value={c.teams_site} onChange={set("teams_site")} placeholder="contoso.sharepoint.com:/sites/AcmePortal" mono />
                  <p className="mt-1 text-[11px] text-faint">The Team&apos;s site — <span className="mono">host:/sites/Name</span>, a site webUrl, or a site id. The tree lands in the site&apos;s default document library.</p>
                </div>
                <Input label="Graph tenant id (Directory ID)" value={c.graph_tenant_id} onChange={set("graph_tenant_id")} placeholder="00000000-0000-…" mono />
                <Input label="Graph client id (Application ID)" value={c.graph_client_id} onChange={set("graph_client_id")} placeholder="00000000-0000-…" mono />
                <div className="sm:col-span-2">
                  <Secret label="Graph client secret" value={graphSecret} onChange={setGraphSecret} isSet={c.has_graph_secret} />
                  <p className="mt-1 text-[11px] text-faint">This client&apos;s Azure AD app (perm <span className="mono">Sites.ReadWrite.All</span>, admin-consented). Leave blank to fall back to the server <span className="mono">GRAPH_*</span> env.</p>
                </div>
              </>
            )}
            <Input label="Jira project key" value={c.jira_project} onChange={set("jira_project")} placeholder="KAN" mono />
            <Input label="Jira board id" value={c.jira_board_id} onChange={set("jira_board_id")} placeholder="12" mono />
          </div>
        </section>

        {/* team */}
        <section className="rounded-card border border-line bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Team</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">The people on this engagement — each becomes a role view. Multiple people can share a role (e.g. 3 Engineers).</p>
            </div>
            <button onClick={addMember} className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium text-body hover:bg-shell">+ Add member</button>
          </div>

          <div className="mt-4 space-y-3">
            {team.length === 0 && <p className="rounded-tile border border-dashed border-line bg-shell/40 px-4 py-6 text-center text-[12.5px] text-muted">No team yet — add a PM, engineers, designer…</p>}
            {team.map((m, i) => (
              <div key={i} className="rounded-tile border border-line p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input label="Name" value={m.name} onChange={(v) => updateMember(i, { name: v })} placeholder="Sam Okoro" />
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Role</span>
                    <select value={m.role} onChange={(e) => updateMember(i, { role: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
                      {ROLE_OPTIONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                    </select>
                  </label>
                  <Input label="Title" value={m.title} onChange={(v) => updateMember(i, { title: v })} placeholder="Engineer" />
                  <Input label="Start date" value={m.start_date} onChange={(v) => updateMember(i, { start_date: v })} type="date" mono />
                  <Input label="End date" value={m.end_date} onChange={(v) => updateMember(i, { end_date: v })} type="date" mono />
                  <Input label="Initials (optional)" value={m.initials} onChange={(v) => updateMember(i, { initials: v })} placeholder="auto" mono />
                  <div className="sm:col-span-2">
                    <Input label="Comments" value={m.comments} onChange={(v) => updateMember(i, { comments: v })} placeholder="Allocation, notes, focus area…" />
                  </div>
                  <div className="flex items-end">
                    <button onClick={() => removeMember(i)} className="rounded-lg px-3 py-2 text-[12.5px] font-medium text-bad hover:bg-bad-weak/50">Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* repos */}
        <section className="rounded-card border border-line bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Code repositories</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">The repo set — every story targets one repo by <span className="font-medium">area</span>. Set <span className="mono">local path</span> to enable real orchestrator runs.</p>
            </div>
            <button onClick={addRepo} className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium text-body hover:bg-shell">+ Add repo</button>
          </div>

          <div className="mt-4 space-y-3">
            {repos.length === 0 && <p className="rounded-tile border border-dashed border-line bg-shell/40 px-4 py-6 text-center text-[12.5px] text-muted">No repos yet — add your frontend / backend / QA repos.</p>}
            {repos.map((r, i) => (
              <div key={i} className="rounded-tile border border-line p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input label="Name" value={r.name} onChange={(v) => updateRepo(i, { name: v })} placeholder="acme-portal-web" />
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Area</span>
                    <select value={r.area} onChange={(e) => updateRepo(i, { area: e.target.value as RepoArea })} className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
                      {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                  <Input label="Default branch" value={r.default_branch} onChange={(v) => updateRepo(i, { default_branch: v })} placeholder="main" mono />
                  <Input label="Remote URL" value={r.url} onChange={(v) => updateRepo(i, { url: v })} placeholder="https://github.com/…" mono />
                  <Input label="Local path (for real runs)" value={r.local_path} onChange={(v) => updateRepo(i, { local_path: v })} placeholder="/Users/…/acme-portal-web" mono />
                  <div className="flex items-end">
                    <button onClick={() => removeRepo(i)} className="rounded-lg px-3 py-2 text-[12.5px] font-medium text-bad hover:bg-bad-weak/50">Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* docs */}
        <section className="rounded-card border border-line bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Documentation — {c.docs_provider === "teams" ? "Teams / SharePoint" : "Confluence"}</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">The standard structure — identical every engagement, incl. the sprint-review template. {c.docs_provider === "teams" ? "Folders + files in the Team's document library." : "Pages in the Confluence space."}</p>
            </div>
            <button onClick={scaffold} disabled={scaffolding} className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium text-body hover:bg-shell disabled:opacity-40">{scaffolding ? "Scaffolding…" : "Scaffold docs"}</button>
          </div>
          {initialDocs.length === 0 ? (
            <p className="mt-4 rounded-tile border border-dashed border-line bg-shell/40 px-4 py-6 text-center text-[12.5px] text-muted">Not scaffolded yet — click <span className="font-medium">Scaffold docs</span> to create the standard tree.</p>
          ) : (
            <div className="mt-4">
              {initialDocs.map((d) => {
                const depth = d.path.split("/").length - 1;
                return (
                  <div key={d.path} className="flex items-center gap-2 py-1 text-[12.5px]" style={{ paddingLeft: depth * 18 }}>
                    <span className="text-faint">{d.kind === "folder" ? "📁" : d.kind === "template" ? "🧩" : "📄"}</span>
                    <span className={depth === 0 ? "font-semibold text-ink" : "text-body"}>{d.title}</span>
                    {d.url ? <a href={d.url} target="_blank" className="text-brand hover:underline">open ↗</a> : (
                      <span className={`ml-1 rounded-pill px-1.5 py-0.5 text-[10.5px] font-medium ${d.status === "created" ? "bg-good-weak text-good" : "bg-shell text-faint"}`}>{d.status === "created" ? "created" : "pending"}</span>
                    )}
                  </div>
                );
              })}
              {initialDocs.some((d) => d.status === "pending") && (
                <p className="mt-3 rounded-lg border border-line bg-shell/40 px-3 py-2 text-[11.5px] text-muted">Pending = recorded but not yet created in {c.docs_provider === "teams" ? "SharePoint" : "Confluence"}. Fill this engagement&apos;s {c.docs_provider === "teams" ? "site + Graph credentials" : "space + Atlassian credentials"} above (Save), then re-scaffold to create them for real.</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
