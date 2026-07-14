"use client";

import { useState } from "react";
import { Activity } from "@/app/lib/data";
import { relatedLink } from "@/app/lib/format";

// The shared task-history table — one component behind both the Program Activity view and each
// role's history in "Jobs to do". Simple rows: Issue · Description · Owner · a log icon that
// expands the persisted AI execution log (run.log via /api/run-log).
const DOT: Record<string, string> = { done: "bg-good", failed: "bg-bad", filed: "bg-brand" };
const GRID = "grid grid-cols-[116px_1fr_128px_40px] items-center gap-3";

type RunDetail = { log?: string; status?: string; failed_step?: string | null; error?: string | null; loading?: boolean };

export function HistoryTable({ rows, atlassianBase = "" }: { rows: Activity[]; atlassianBase?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, RunDetail>>({});

  async function toggle(runId: string | null) {
    if (!runId) return;
    if (open === runId) { setOpen(null); return; }
    setOpen(runId);
    if (!runs[runId]) {
      setRuns((r) => ({ ...r, [runId]: { loading: true } }));
      try {
        const res = await fetch(`/api/run-log?id=${encodeURIComponent(runId)}`);
        const j = await res.json();
        setRuns((r) => ({ ...r, [runId]: j.ok ? j.run : { log: "(run not found)" } }));
      } catch { setRuns((r) => ({ ...r, [runId]: { log: "(failed to load log)" } })); }
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className={`${GRID} border-b border-line px-5 py-2 text-[10.5px] font-medium uppercase tracking-wide text-faint`}>
          <span>Issue</span><span>Description</span><span>Owner</span><span className="text-right">Log</span>
        </div>
        <div className="divide-y divide-line">
          {rows.map((a) => {
            const link = relatedLink(a.related, atlassianBase);
            const isOpen = a.run_id != null && open === a.run_id;
            const detail = a.run_id ? runs[a.run_id] : undefined;
            return (
              <div key={a.id}>
                <div className={`${GRID} px-5 py-2.5 text-[12.5px]`}>
                  <span className="mono truncate text-[11px]">
                    {a.related
                      ? (link ? <a href={link} target="_blank" rel="noreferrer" className="text-brand hover:underline">{a.related}</a> : <span className="text-faint">{a.related}</span>)
                      : <span className="text-faint">—</span>}
                  </span>
                  <span className="flex min-w-0 items-center gap-2" title={a.title}>
                    <span className={`inline-block size-1.5 shrink-0 rounded-pill ${DOT[a.status] ?? "bg-faint"}`} title={a.status} />
                    <span className="truncate text-body">{a.title}</span>
                  </span>
                  <span className="truncate text-[12px] text-ink">{a.actor || "—"}</span>
                  <span className="text-right">
                    {a.run_id ? (
                      <button onClick={() => toggle(a.run_id)} className={`rounded-md p-1 hover:bg-shell hover:text-ink ${isOpen ? "text-brand" : "text-faint"}`} title="View AI run details">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="2.5" /></svg>
                      </button>
                    ) : <span className="text-[11px] text-faint">—</span>}
                  </span>
                </div>
                {isOpen && (
                  <div className="mx-5 mb-3 overflow-hidden rounded-tile border border-line">
                    <div className="flex items-center gap-2 border-b border-line bg-ink px-3 py-1.5">
                      <span className={`inline-block size-2 rounded-pill ${detail?.status === "failed" ? "bg-bad" : "bg-good"}`} />
                      <span className="text-[10.5px] font-medium text-white/90">AI run · {a.related}{detail?.failed_step ? ` · failed at ${detail.failed_step}` : ""}</span>
                      <span className="mono ml-auto text-[10px] text-white/40">{a.run_id}</span>
                    </div>
                    <pre className="mono max-h-72 overflow-auto bg-[#0e1420] px-3 py-2 text-[10.5px] leading-relaxed text-[#c8cdd6] whitespace-pre-wrap">{detail?.loading ? "loading…" : detail?.log || "(no log captured)"}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
