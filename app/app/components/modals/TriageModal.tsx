"use client";

import { useState } from "react";
import { runStreamed } from "@/app/lib/exec-client";
import { Modal } from "../ui/Modal";
import { ExecLog } from "../ui/ExecLog";
import { Spinner } from "../ui/Spinner";

type TriageResult = { key: string; severity: string; area: string; recommendation: string };

// Support — classify an issue (type · severity · area) and file a routed Jira issue.
export function TriageModal({ open, onClose, engagementId, actor, onDone }: {
  open: boolean; onClose: () => void; engagementId: string; actor?: string; onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [result, setResult] = useState<TriageResult | null>(null);

  async function run() {
    if (!title.trim()) { setErr("Describe the issue first."); return; }
    setBusy(true); setErr(null); setLog("");
    try {
      const j = await runStreamed<{ ok?: boolean } & Partial<TriageResult>>("/api/triage", { engagementId, title, description: desc, actor }, setLog);
      if (!j.ok) { setErr("Triage failed — see the log."); return; }
      setResult({ key: j.key ?? "", severity: j.severity ?? "", area: j.area ?? "", recommendation: j.recommendation ?? "" });
      setTitle(""); setDesc(""); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} busy={busy} title="Triage an issue" subtitle="The triage agent classifies it (type · severity · area) and files a routed Jira issue.">
      {result ? (
        <div className="mt-4 rounded-tile border border-good-line bg-good-weak/50 p-4">
          <div className="text-[13.5px] font-semibold text-ink">Filed <span className="mono">{result.key}</span></div>
          <div className="mt-1 text-[12.5px] text-body">Severity <span className="font-medium">{result.severity}</span> · Area <span className="font-medium">{result.area}</span> · <span className="font-medium">{result.recommendation}</span></div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setResult(null)} className="rounded-lg border border-line bg-card px-3 py-1.5 text-[12.5px] font-medium text-body hover:bg-shell">Triage another</button>
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-muted hover:text-ink">Done</button>
          </div>
        </div>
      ) : (
        <>
          <label className="mt-4 block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Issue</span>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CSV import drops rows with negative amounts"
              className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
          </label>
          <label className="mt-3 block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Details (optional)</span>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Steps, impact, where it happens…"
              className="mt-1 w-full resize-none rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
          </label>
          <ExecLog log={log} />
          {err && <p className="mt-3 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{err}</p>}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-40">Cancel</button>
            <button onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {busy ? (<><Spinner /> Triaging…</>) : "Triage & file"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
