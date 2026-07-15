"use client";

import { useEffect, useState } from "react";
import { runStreamed } from "@/app/lib/exec-client";
import { ProgramModel, GENERIC_WORKFLOWS } from "@/app/lib/data";
import { firstTicketId } from "@/app/lib/tickets";
import { Modal } from "../ui/Modal";
import { ExecLog } from "../ui/ExecLog";
import { Spinner } from "../ui/Spinner";
import { TicketOptions } from "../ui/TicketOptions";
import { PlaybookEditor, Action } from "../ui/PlaybookEditor";

// Any role — run a generic workflow on a labeled ticket through the shared lifecycle, then turn its
// action items into an editable playbook → tracked tasks (same as research).
export function WorkflowModal({ open, onClose, workflowKey, roleCode, roleTitle, engagementId, actor, onDone, storyList }: {
  open: boolean; onClose: () => void; workflowKey: string; roleCode: string; roleTitle: string;
  engagementId: string; actor?: string; onDone: () => void; storyList: ProgramModel["storyList"];
}) {
  const [story, setStory] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<null | { gated?: boolean; related?: string }>(null);
  const [actions, setActions] = useState<Action[] | null>(null);
  const [log, setLog] = useState("");
  const label = GENERIC_WORKFLOWS[workflowKey] ?? "Run workflow";

  useEffect(() => { if (open) { setStory(firstTicketId(storyList, roleCode)); setErr(null); setOutcome(null); setActions(null); setLog(""); } }, [open, storyList, roleCode]);

  async function run() {
    if (!story) { setErr("Pick a ticket to run this on."); return; }
    setBusy(true); setErr(null); setOutcome(null); setActions(null); setLog("");
    try {
      const r = await runStreamed<{ ok?: boolean; gated?: boolean; related?: string; actions?: Action[] }>("/api/workflow", { engagementId, workflowKey, storyId: story, actor }, setLog);
      if (!r.ok) { setErr("Workflow failed — see the log."); return; }
      setOutcome({ gated: r.gated, related: r.related }); setActions(r.actions ?? []); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }

  const done = actions !== null;
  return (
    <Modal open={open} onClose={onClose} busy={busy} maxWidth={done ? 540 : 460} title={label} subtitle={`Your ${roleTitle.toLowerCase()} agent runs this on a ticket labeled for you, then drafts a playbook of next steps.`}>
      {!done && (
        <label className="mt-4 block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Ticket</span>
          <select value={story} onChange={(e) => setStory(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
            <TicketOptions storyList={storyList} roleCode={roleCode} />
          </select>
        </label>
      )}

      <ExecLog log={log} />
      {err && <p className="mt-3 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{err}</p>}
      {done && !err && (
        <p className="mt-3 rounded-lg border border-good-line bg-good-weak/50 px-3 py-2 text-[12px] text-good">
          {outcome?.gated ? `${label} drafted — ${story} is Awaiting HITL approval.` : `${label} done on ${story}.`}
          {outcome?.related && /^https?:\/\//i.test(outcome.related) && <> · <a href={outcome.related} target="_blank" rel="noreferrer" className="underline">open doc ↗</a></>}
        </p>
      )}

      {done && <PlaybookEditor storyId={story} initial={actions} onDone={onDone} />}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-40">{done ? "Done" : "Cancel"}</button>
        {!done && (
          <button onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? (<><Spinner /> Agent working…</>) : `Run ${label}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
