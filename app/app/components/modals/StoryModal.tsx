"use client";

import { useEffect, useState } from "react";
import { runStreamed } from "@/app/lib/exec-client";
import { ProgramModel } from "@/app/lib/data";
import { Modal } from "../ui/Modal";
import { ExecLog } from "../ui/ExecLog";

const ROLE_OPTS = ["engineer", "designer", "ux-writer", "researcher", "automation"];

// Product Owner — add one role-labeled functional story under an epic (→ Ready / To Do in Jira).
export function StoryModal({ open, onClose, engagementId, actor, onDone, epics }: {
  open: boolean; onClose: () => void; engagementId: string; actor?: string; onDone: () => void;
  epics: ProgramModel["epics"];
}) {
  const [epic, setEpic] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("engineer");
  const [pts, setPts] = useState("");
  const [acc, setAcc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState("");

  useEffect(() => { if (open) setEpic((e) => e || epics[0]?.id || ""); }, [open, epics]);

  async function create(keepOpen: boolean) {
    if (!epic) { setErr("Pick an epic to add the story to."); return; }
    if (!title.trim()) { setErr("Give the story a title."); return; }
    setBusy(true); setErr(null); setLog("");
    try {
      const r = await runStreamed<{ ok?: boolean }>("/api/story", { engagementId, epicId: epic, title, role, points: pts ? Number(pts) : 0, acceptance: acc, actor }, setLog);
      if (!r.ok) { setErr("Could not add the story — see the log."); return; }
      setTitle(""); setPts(""); setAcc("");
      if (!keepOpen) onClose();
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Add a story" subtitle="Add a functional story under an epic, labeled for the role that owns it.">
      <label className="mt-4 block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Epic</span>
        <select value={epic} onChange={(e) => setEpic(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
          {epics.length === 0 && <option value="">— no epics yet —</option>}
          {epics.map((ep) => <option key={ep.id} value={ep.id}>{ep.id} · {ep.title} · {ep.stories} {ep.stories === 1 ? "story" : "stories"}</option>)}
        </select>
      </label>
      <label className="mt-3 block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Story title</span>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="As a user, I can …"
          className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
      </label>
      <label className="mt-3 block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Acceptance criteria</span>
        <textarea value={acc} onChange={(e) => setAcc(e.target.value)} rows={3} placeholder="Given / when / then — what must be true for this to be done."
          className="mt-1 w-full resize-none rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
      </label>
      <div className="mt-3 flex gap-3">
        <label className="block flex-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Owning role</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
            {ROLE_OPTS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="block w-28">
          <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Points</span>
          <input value={pts} onChange={(e) => setPts(e.target.value.replace(/[^0-9]/g, ""))} placeholder="—" inputMode="numeric"
            className="mono mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
        </label>
      </div>
      <ExecLog log={log} />
      {err && <p className="mt-3 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{err}</p>}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} disabled={busy} className="mr-auto rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-40">Cancel</button>
        <button onClick={() => create(true)} disabled={busy} className="rounded-lg border border-line bg-card px-3 py-2 text-[13px] font-medium text-body hover:bg-shell disabled:opacity-40">{busy ? "Adding…" : "Create & add another"}</button>
        <button onClick={() => create(false)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">{busy ? "Adding…" : "Create story"}</button>
      </div>
    </Modal>
  );
}
