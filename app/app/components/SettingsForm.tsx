"use client";

import { useState } from "react";
import { slotByName } from "@/app/lib/adapters";
import { AdapterConfig } from "@/app/components/ui/AdapterConfig";
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
type DocRow = { path: string; title: string; kind: string; status: string; url: string | null };

export type SettingsSection = "connectors" | "team" | "repos" | "docs";

export function SettingsForm({ engagementId, section, initialConnectors, initialRepos, initialDocs, initialMembers }: {
  engagementId: string; section: SettingsSection; initialConnectors: Connectors; initialRepos: RepoRef[]; initialDocs: DocRow[]; initialMembers: TeamMember[];
}) {
  const router = useRouter();
  const [c, setC] = useState<Connectors>(initialConnectors);
  const [atlassianToken, setAtlassianToken] = useState("");
  const [graphSecret, setGraphSecret] = useState("");

  // The registry addresses fields by engagement COLUMN, so bridge the connector object and the
  // two write-only secrets into one flat map. Secrets live outside `c` because `c` is what the
  // server sent back — and it never contains a secret value, only whether one is set.
  const adapterValues: Record<string, string> = {
    ...(c as unknown as Record<string, string>),
    atlassian_api_token: atlassianToken,
    graph_client_secret: graphSecret,
  };
  const setAdapterValue = (k: string, v: string) => {
    if (k === "atlassian_api_token") return setAtlassianToken(v);
    if (k === "graph_client_secret") return setGraphSecret(v);
    setC({ ...c, [k]: v });
  };
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
    <div className="space-y-4">
      <div>
        {/* connectors */}
        {section === "connectors" && <section className="rounded-card border border-line bg-card p-5">
          <h2 className="text-[15px] font-semibold text-ink">Connectors</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">Design source, docs store, and tracker for this engagement.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input label="Figma file / project" value={c.figma_url} onChange={set("figma_url")} placeholder="https://figma.com/file/…" mono />
            <div />
          </div>

          {/* Adapter slots — rendered from the registry (lib/adapters.ts), the same control the
              new-engagement screen uses. Previously this block hand-rolled every provider's fields,
              which is exactly the drift the registry exists to end: a provider added in one screen
              and forgotten in the other. Secrets stay write-only — only their presence is known. */}
          <div className="mt-5 space-y-5">
            <AdapterConfig
              slot={slotByName("docs")}
              provider={c.docs_provider}
              onProvider={(id) => setC({ ...c, docs_provider: id as DocsProvider })}
              values={adapterValues}
              onValue={setAdapterValue}
              present={{ has_atlassian_token: c.has_atlassian_token, has_graph_secret: c.has_graph_secret }}
            />
            <div className="border-t border-line pt-5">
              <AdapterConfig
                slot={slotByName("tickets")}
                provider="jira"
                onProvider={() => { /* single implemented tracker — see AdapterSlot.providerKey */ }}
                values={adapterValues}
                onValue={setAdapterValue}
                present={{ has_atlassian_token: c.has_atlassian_token }}
              />
            </div>
            <p className="text-[11px] text-faint">
              Leave credentials blank to fall back to the server <span className="mono">.env</span>.
              A stored secret is never shown again — blank keeps it.
            </p>
          </div>
        </section>}

        {section === "team" && <section className="rounded-card border border-line bg-card p-5">
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
        </section>}

        {section === "repos" && <section className="rounded-card border border-line bg-card p-5">
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
        </section>}

        {section === "docs" && <section className="rounded-card border border-line bg-card p-5">
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
        </section>}
      </div>

      {/* Connectors, team and repos post together to /api/connectors, so one save covers the
          three of them wherever you happen to be standing. The docs list is read-only. */}
      {section !== "docs" && (
        <div className="flex items-center justify-end gap-3">
          {state === "saved" && <span className="text-[12.5px] font-medium text-good">✓ Saved</span>}
          <button onClick={save} disabled={state === "saving"}
            className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40">
            {state === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
