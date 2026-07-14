"use client";

import { useEffect, useState } from "react";
import { runStreamed } from "@/app/lib/exec-client";
import { ProgramModel } from "@/app/lib/data";
import { firstTicketId } from "@/app/lib/tickets";
import { Modal } from "../ui/Modal";
import { ExecLog } from "../ui/ExecLog";
import { Spinner } from "../ui/Spinner";
import { TicketOptions } from "../ui/TicketOptions";

// Researcher — run the research workflow on a research-labeled ticket (In Progress → Awaiting HITL
// approval; drafts a doc into the engagement's docs provider).
export function ResearchModal({ open, onClose, engagementId, actor, onDone, storyList, providerLabel }: {
  open: boolean; onClose: () => void; engagementId: string; actor?: string; onDone: () => void;
  storyList: ProgramModel["storyList"]; providerLabel: string;
}) {
  const [story, setStory] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [log, setLog] = useState("");

  useEffect(() => { if (open) { setStory(firstTicketId(storyList, "researcher")); setErr(null); setUrl(null); setLog(""); } }, [open, storyList]);

  async function run() {
    if (!story) { setErr("Pick a research ticket to run."); return; }
    setBusy(true); setErr(null); setUrl(null); setLog("");
    try {
      const r = await runStreamed<{ ok?: boolean; url?: string | null }>("/api/research", { engagementId, storyId: story, actor }, setLog);
      if (!r.ok) { setErr("Research failed — see the log."); return; }
      setUrl(r.url ?? null); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} busy={busy} maxWidth={460} title="Run research" subtitle={`Reads the product brief and drafts a research doc into ${providerLabel} — the PM approves it before refinement.`}>
      <label className="mt-4 block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Research ticket</span>
        <select value={story} onChange={(e) => setStory(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
          <TicketOptions storyList={storyList} roleCode="researcher" />
        </select>
      </label>
      <ExecLog log={log} />
      {err && <p className="mt-3 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{err}</p>}
      {url !== null && !err && (
        <p className="mt-3 rounded-lg border border-good-line bg-good-weak/50 px-3 py-2 text-[12px] text-good">Draft created — sent to the PM for approval.{url && <> · <a href={url} target="_blank" rel="noreferrer" className="underline">open doc ↗</a></>}</p>
      )}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-40">{url !== null ? "Done" : "Cancel"}</button>
        <button onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {busy ? (<><Spinner /> Research agent drafting…</>) : "Run research"}
        </button>
      </div>
    </Modal>
  );
}
