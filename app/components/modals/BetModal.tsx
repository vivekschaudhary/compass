"use client";

import { useState } from "react";
import { runStreamed } from "@/app/lib/exec-client";
import { ProgramModel } from "@/app/lib/data";
import { Modal } from "../ui/Modal";
import { ExecLog } from "../ui/ExecLog";
import { Spinner } from "../ui/Spinner";

// PM — turn a short brief into an epic + role-labeled functional stories.
export function BetModal({ open, onClose, engagementId, actor, onDone, deliverables }: {
  open: boolean; onClose: () => void; engagementId: string; actor?: string; onDone: () => void;
  deliverables: ProgramModel["deliverables"];
}) {
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [del, setDel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState("");

  async function create() {
    if (!title.trim()) { setErr("Give the epic a title."); return; }
    setBusy(true); setErr(null); setLog("");
    try {
      const r = await runStreamed<{ ok?: boolean }>("/api/bet", { engagementId, title, brief, deliverableCode: del || undefined, actor }, setLog);
      if (!r.ok) { setErr("Could not create the epic — see the log."); return; }
      setTitle(""); setBrief(""); setDel(""); onClose(); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Create an epic" subtitle="Your PM agent turns a brief into an epic + functional stories, added to the backlog.">
      <label className="mt-4 block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Epic title</span>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Recurring-spend alerts"
          className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
      </label>
      <label className="mt-3 block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Brief</span>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} placeholder="The problem, who it's for, and the outcome. A few sentences is enough."
          className="mt-1 w-full resize-none rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
      </label>
      <label className="mt-3 block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Grounds to deliverable (optional)</span>
        <select value={del} onChange={(e) => setDel(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
          <option value="">— none —</option>
          {deliverables.map((d) => <option key={d.code} value={d.code}>{d.code} · {d.title}</option>)}
        </select>
      </label>

      <ExecLog log={log} />
      {err && <p className="mt-3 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{err}</p>}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-40">Cancel</button>
        <button onClick={create} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? (<><Spinner /> PM agent drafting…</>) : "Create epic"}
        </button>
      </div>
    </Modal>
  );
}
