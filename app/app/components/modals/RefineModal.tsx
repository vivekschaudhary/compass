"use client";

import { useEffect, useState } from "react";
import { runStreamed } from "@/app/lib/exec-client";
import { ProgramModel } from "@/app/lib/data";
import { Modal } from "../ui/Modal";
import { ExecLog } from "../ui/ExecLog";
import { Spinner } from "../ui/Spinner";

type Proposed = { title: string; acceptance?: string; points?: number };

// Product Owner — propose new build stories from approved research (propose → pick → accept).
export function RefineModal({ open, onClose, engagementId, actor, onDone, epics }: {
  open: boolean; onClose: () => void; engagementId: string; actor?: string; onDone: () => void;
  epics: ProgramModel["epics"];
}) {
  const approvedEpics = epics.filter((e) => e.research === "approved");
  const [epic, setEpic] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposed[] | null>(null);
  const [sel, setSel] = useState<boolean[]>([]);
  const [log, setLog] = useState("");

  useEffect(() => { if (open) { setEpic(approvedEpics[0]?.id ?? ""); setProposals(null); setErr(null); setLog(""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function propose() {
    if (!epic) { setErr("Pick an epic with approved research."); return; }
    setBusy(true); setErr(null); setProposals(null); setLog("");
    try {
      const r = await runStreamed<{ ok?: boolean; proposals?: Proposed[] }>("/api/refine", { engagementId, epicId: epic, mode: "propose" }, setLog);
      if (!r.ok) { setErr("Could not propose — see the log."); return; }
      setProposals(r.proposals ?? []); setSel((r.proposals ?? []).map(() => true));
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }
  async function accept() {
    const picked = (proposals ?? []).filter((_, i) => sel[i]);
    if (!picked.length) { setErr("Select at least one story."); return; }
    setBusy(true); setErr(null); setLog("");
    try {
      const r = await runStreamed<{ ok?: boolean; created?: number }>("/api/refine", { engagementId, epicId: epic, mode: "accept", stories: picked, actor }, setLog);
      if (!r.ok) { setErr("Could not add the stories — see the log."); return; }
      onClose(); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }

  const nSel = sel.filter(Boolean).length;
  return (
    <Modal open={open} onClose={onClose} busy={busy} maxWidth={520} title="Refine from research" subtitle="Propose new build stories from the approved research. You accept — nothing is overwritten.">
      {approvedEpics.length === 0 ? (
        <p className="mt-4 rounded-tile border border-dashed border-line bg-shell/40 px-4 py-6 text-center text-[12.5px] text-muted">No epics with <span className="font-medium">approved research</span> yet. Run research and have the PM approve it first.</p>
      ) : (
        <>
          <label className="mt-4 block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Epic (research approved)</span>
            <select value={epic} onChange={(e) => { setEpic(e.target.value); setProposals(null); }} className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
              {approvedEpics.map((ep) => <option key={ep.id} value={ep.id}>{ep.id} · {ep.title}</option>)}
            </select>
          </label>

          <ExecLog log={log} />
          {proposals === null ? (
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-40">Cancel</button>
              <button onClick={propose} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {busy ? (<><Spinner /> Reading research…</>) : "Propose stories"}
              </button>
            </div>
          ) : proposals.length === 0 ? (
            <p className="mt-4 rounded-tile border border-dashed border-line bg-shell/40 px-4 py-6 text-center text-[12.5px] text-muted">The research didn&apos;t surface new stories beyond what&apos;s there. Nothing to add.</p>
          ) : (
            <>
              <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                {proposals.map((p, i) => (
                  <label key={i} className="flex cursor-pointer items-start gap-2.5 rounded-tile border border-line p-3 hover:bg-shell/40">
                    <input type="checkbox" checked={sel[i] ?? false} onChange={(e) => setSel(sel.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="text-[13px] font-medium text-ink">{p.title}</span>{p.points ? <span className="tnum text-[11px] text-muted">{p.points}pt</span> : null}</span>
                      {p.acceptance && <span className="mt-0.5 block text-[12px] leading-snug text-muted">{p.acceptance}</span>}
                    </span>
                  </label>
                ))}
              </div>
              {err && <p className="mt-3 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{err}</p>}
              <div className="mt-4 flex items-center justify-end gap-2">
                <button onClick={() => setProposals(null)} disabled={busy} className="mr-auto rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-40">← Back</button>
                <button onClick={accept} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  {busy ? "Adding…" : `Accept ${nSel} ${nSel === 1 ? "story" : "stories"}`}
                </button>
              </div>
            </>
          )}
          {err && proposals === null && <p className="mt-3 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{err}</p>}
        </>
      )}
    </Modal>
  );
}
