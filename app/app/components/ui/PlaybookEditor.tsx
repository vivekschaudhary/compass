"use client";

import { useState } from "react";
import { StoryTasks } from "../StoryTasks";

// The editable playbook — an AI deliverable's action items (drafted ~80%) that the user edits, adds
// to (the last 20%), then promotes to tracked tasks on the story. Shared by ResearchModal +
// WorkflowModal. After "Create", it swaps to the live task + AC checklist (StoryTasks).
export type Action = { title: string; role?: string };
const ROLE_OPTS = ["researcher", "designer", "ux-writer", "engineer", "automation", "pm"];

export function PlaybookEditor({ storyId, initial, onDone }: { storyId: string; initial: Action[]; onDone?: () => void }) {
  const [actions, setActions] = useState<Action[]>(initial.length ? initial : [{ title: "", role: "engineer" }]);
  const [promoting, setPromoting] = useState(false);
  const [created, setCreated] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const setItem = (i: number, patch: Partial<Action>) => setActions((a) => a.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => setActions((a) => a.filter((_, j) => j !== i));
  const addItem = () => setActions((a) => [...a, { title: "", role: "engineer" }]);
  const valid = actions.filter((a) => a.title.trim());

  async function createTasks() {
    if (!valid.length) { setErr("Add at least one task."); return; }
    setPromoting(true); setErr(null);
    try {
      await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "promote", storyId, items: valid }) });
      await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seed-ac", storyId }) });
      setCreated(true); setRefreshKey((k) => k + 1); onDone?.();
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setPromoting(false); }
  }

  if (created) {
    return (
      <div className="mt-3">
        <p className="rounded-lg border border-good-line bg-good-weak/50 px-3 py-2 text-[12px] text-good">Tasks created on {storyId} + mirrored to Jira.</p>
        <StoryTasks storyId={storyId} refreshKey={refreshKey} />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Playbook · review &amp; finish</span>
        <span className="text-[11px] text-faint">{actions.length} step{actions.length === 1 ? "" : "s"}</span>
      </div>
      <p className="mt-0.5 text-[12px] text-muted">The AI drafted these. Edit, add your own, then create them as tracked tasks on {storyId}.</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {actions.map((a, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input value={a.title} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="a concrete next step…"
              className="min-w-0 flex-1 rounded-lg border border-line bg-shell/40 px-2.5 py-1.5 text-[12.5px] text-body outline-none focus:border-brand" />
            <select value={a.role ?? "engineer"} onChange={(e) => setItem(i, { role: e.target.value })} className="rounded-lg border border-line bg-shell/40 px-2 py-1.5 text-[11.5px] text-muted outline-none focus:border-brand">
              {ROLE_OPTS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={() => removeItem(i)} className="rounded-md px-1.5 py-1 text-[13px] text-faint hover:bg-shell hover:text-bad" title="Remove">✕</button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button onClick={addItem} className="text-[12px] font-medium text-brand hover:underline">+ add step</button>
        <button onClick={createTasks} disabled={promoting} className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {promoting ? "Creating…" : `Create ${valid.length} task${valid.length === 1 ? "" : "s"}`}
        </button>
      </div>
      {err && <p className="mt-2 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{err}</p>}
    </div>
  );
}
