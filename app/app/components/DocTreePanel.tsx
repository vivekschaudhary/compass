"use client";

import { useEffect, useState } from "react";

type Node = { path: string; title: string; kind: string; parent_path: string; ord?: number };

// Sprint 0 · "Connect systems of record" → the workspace doc structure. Seeded per-engagement from
// the framework default (compass/templates/doc-tree.md), refined here, then created on approve.
// [sprint-0-materializes-refinable-defaults]
export function DocTreePanel({ engagementId }: { engagementId: string }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "save" | "approve">("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!engagementId) { setLoading(false); return; }
    fetch(`/api/scaffold?engagementId=${encodeURIComponent(engagementId)}`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setNodes((j.nodes ?? []).map(norm)); setApproved(Boolean(j.approved)); } })
      .finally(() => setLoading(false));
  }, [engagementId]);

  function norm(n: Record<string, unknown>): Node {
    return { path: String(n.path ?? ""), title: String(n.title ?? ""), kind: String(n.kind ?? "doc"), parent_path: String(n.parent_path ?? "") };
  }
  function update(i: number, patch: Partial<Node>) { setNodes(nodes.map((n, j) => (j === i ? { ...n, ...patch } : n))); setApproved(false); }
  function remove(i: number) { setNodes(nodes.filter((_, j) => j !== i)); setApproved(false); }
  function add() { setNodes([...nodes, { path: "", title: "", kind: "doc", parent_path: "" }]); setApproved(false); }

  async function save() {
    setBusy("save"); setMsg("");
    const clean = nodes.filter((n) => n.path.trim() && n.title.trim()).map((n, i) => ({ ...n, ord: i }));
    const r = await fetch("/api/scaffold", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engagementId, nodes: clean }) });
    const j = await r.json();
    setBusy(""); setMsg(j.ok ? `Saved ${j.nodes} nodes — not yet created. Approve to scaffold.` : (j.error || "save failed"));
  }
  async function approve() {
    setBusy("approve"); setMsg("");
    await save();
    const r = await fetch("/api/scaffold", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engagementId }) });
    const j = await r.json();
    setBusy(""); setApproved(Boolean(j.approved));
    if (!j.ok) { setMsg(j.error || "scaffold failed"); return; }
    // Pending = recorded but not created because the docs provider isn't wired for this engagement.
    // Say so + point at the fix (Settings → Documentation) rather than a bare "0 created".
    const created = j.created ?? 0, pending = j.pending ?? 0;
    setMsg(created === 0 && pending > 0
      ? `Approved — ${pending} pages recorded but 0 created: ${j.provider === "teams" ? "Teams/SharePoint" : "Confluence"} isn't connected for this engagement yet. Add the ${j.provider === "teams" ? "site + Graph credentials" : "space + Atlassian credentials"} in Settings → Documentation, then re-approve to create them.`
      : `Approved & scaffolded — ${created} created, ${pending} pending (${j.provider}).`);
  }

  if (loading) return <p className="text-[12.5px] text-muted">Loading doc tree…</p>;

  return (
    <section className="rounded-card border border-line bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Workspace doc tree</h2>
          <p className="mt-0.5 text-[12px] text-faint">
            Seeded from the Compass default · refine the structure, then approve to create it in the wired docs provider.
            {approved ? " ✓ approved" : " · not yet approved"}
          </p>
        </div>
        <button onClick={add} className="text-[12.5px] font-medium text-brand hover:text-brand-ink">+ Add node</button>
      </div>

      <div className="mt-4 space-y-1.5">
        <div className="grid grid-cols-[1fr_1fr_90px_28px] gap-2 px-1 text-[10.5px] uppercase tracking-wide text-faint">
          <span>Title</span><span>Path</span><span>Kind</span><span></span>
        </div>
        {nodes.map((n, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_90px_28px] items-center gap-2">
            <input value={n.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="Title"
              className="rounded-tile border border-line bg-shell px-2 py-1.5 text-[12.5px] text-ink" />
            <input value={n.path} onChange={(e) => update(i, { path: e.target.value })} placeholder="path/slug"
              className="mono rounded-tile border border-line bg-shell px-2 py-1.5 text-[12px] text-muted" />
            <select value={n.kind} onChange={(e) => update(i, { kind: e.target.value })}
              className="rounded-tile border border-line bg-shell px-1.5 py-1.5 text-[12px] text-ink">
              <option value="folder">folder</option><option value="doc">doc</option><option value="template">template</option>
            </select>
            <button onClick={() => remove(i)} className="text-[13px] text-faint hover:text-bad" title="Remove">✕</button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button onClick={save} disabled={busy !== ""}
          className="rounded-tile border border-line bg-shell px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-card disabled:opacity-50">
          {busy === "save" ? "Saving…" : "Save refinements"}
        </button>
        <button onClick={approve} disabled={busy !== ""}
          className="rounded-tile bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90 disabled:opacity-50">
          {busy === "approve" ? "Creating…" : "Approve & create scaffold"}
        </button>
        {msg && <span className="text-[12px] text-muted">{msg}</span>}
      </div>
    </section>
  );
}
