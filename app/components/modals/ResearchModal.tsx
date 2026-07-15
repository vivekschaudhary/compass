"use client";

import { useEffect, useState } from "react";
import { runStreamed } from "@/app/lib/exec-client";
import { ProgramModel } from "@/app/lib/data";
import { firstTicketId } from "@/app/lib/tickets";
import { Modal } from "../ui/Modal";
import { ExecLog } from "../ui/ExecLog";
import { Spinner } from "../ui/Spinner";
import { TicketOptions } from "../ui/TicketOptions";
import { StoryTasks } from "../StoryTasks";

type Action = { title: string; role?: string };
const ROLE_OPTS = ["researcher", "designer", "ux-writer", "engineer", "automation", "pm"];

// Researcher — run research on a labeled ticket. When it completes, the doc's action items come back
// as an EDITABLE playbook (AI drafts ~80%): edit, add your own, then promote them to tracked tasks.
export function ResearchModal({ open, onClose, engagementId, actor, onDone, storyList, providerLabel }: {
  open: boolean; onClose: () => void; engagementId: string; actor?: string; onDone: () => void;
  storyList: ProgramModel["storyList"]; providerLabel: string;
}) {
  const [story, setStory] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [actions, setActions] = useState<Action[] | null>(null); // the editable playbook (80/20)
  const [promoting, setPromoting] = useState(false);
  const [created, setCreated] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (open) { setStory(firstTicketId(storyList, "researcher")); setErr(null); setUrl(null); setLog(""); setActions(null); setCreated(false); }
  }, [open, storyList]);

  async function run() {
    if (!story) { setErr("Pick a research ticket to run."); return; }
    setBusy(true); setErr(null); setUrl(null); setLog(""); setActions(null); setCreated(false);
    try {
      const r = await runStreamed<{ ok?: boolean; url?: string | null; actions?: Action[] }>("/api/research", { engagementId, storyId: story, actor }, setLog);
      if (!r.ok) { setErr("Research failed — see the log."); return; }
      setUrl(r.url ?? null); setActions(r.actions ?? []); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }

  // playbook editing (the 20% the user adds/finishes)
  const setItem = (i: number, patch: Partial<Action>) => setActions((a) => (a ?? []).map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => setActions((a) => (a ?? []).filter((_, j) => j !== i));
  const addItem = () => setActions((a) => [...(a ?? []), { title: "", role: "engineer" }]);

  async function createTasks() {
    const items = (actions ?? []).filter((a) => a.title.trim());
    if (!items.length) { setErr("Add at least one task."); return; }
    setPromoting(true); setErr(null);
    try {
      await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "promote", storyId: story, items }) });
      await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seed-ac", storyId: story }) });
      setCreated(true); setRefreshKey((k) => k + 1); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setPromoting(false); }
  }

  const showPlaybook = actions !== null && !created;
  return (
    <Modal open={open} onClose={onClose} busy={busy || promoting} maxWidth={actions !== null ? 540 : 460} title="Run research" subtitle={`Reads the product brief and drafts a research doc into ${providerLabel} — then turns the recommendations into a playbook.`}>
      {actions === null && (
        <label className="mt-4 block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Research ticket</span>
          <select value={story} onChange={(e) => setStory(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
            <TicketOptions storyList={storyList} roleCode="researcher" />
          </select>
        </label>
      )}

      <ExecLog log={log} />
      {err && <p className="mt-3 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{err}</p>}
      {url !== null && !err && actions !== null && (
        <p className="mt-3 rounded-lg border border-good-line bg-good-weak/50 px-3 py-2 text-[12px] text-good">Research drafted on {story}.{url && <> · <a href={url} target="_blank" rel="noreferrer" className="underline">open doc ↗</a></>}</p>
      )}

      {/* the editable playbook — AI drafted ~80%, you finish the last 20% */}
      {showPlaybook && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Playbook · review &amp; finish</span>
            <span className="text-[11px] text-faint">{(actions ?? []).length} step{(actions ?? []).length === 1 ? "" : "s"}</span>
          </div>
          <p className="mt-0.5 text-[12px] text-muted">The AI drafted these from its recommendations. Edit, add your own, then create them as tracked tasks on {story}.</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {(actions ?? []).map((a, i) => (
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
          <button onClick={addItem} className="mt-1.5 text-[12px] font-medium text-brand hover:underline">+ add step</button>
        </div>
      )}

      {/* after promoting — the tracked tasks + AC checklist */}
      {created && (
        <div className="mt-3">
          <p className="rounded-lg border border-good-line bg-good-weak/50 px-3 py-2 text-[12px] text-good">Tasks created on {story} + mirrored to Jira.</p>
          <StoryTasks storyId={story} refreshKey={refreshKey} />
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} disabled={busy || promoting} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-40">{created ? "Done" : "Cancel"}</button>
        {actions === null ? (
          <button onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? (<><Spinner /> Research agent drafting…</>) : "Run research"}
          </button>
        ) : !created ? (
          <button onClick={createTasks} disabled={promoting} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {promoting ? (<><Spinner /> Creating…</>) : `Create ${(actions ?? []).filter((a) => a.title.trim()).length} tasks`}
          </button>
        ) : null}
      </div>
    </Modal>
  );
}
