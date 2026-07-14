"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Role, FailedRun } from "@/app/lib/data";

export function AssistantDock({ role, failedRun, onClose }: { role: Role; failedRun: FailedRun; onClose: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"thinking" | "streaming" | "done">("thinking");
  const [out, setOut] = useState("");
  const [reexec, setReexec] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [log, setLog] = useState("");
  const started = useRef(false);
  const logRef = useRef<HTMLPreElement>(null);

  // Stream the live diagnosis from the guarded assistant endpoint.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      setPhase("thinking");
      try {
        const res = await fetch("/api/assistant", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: failedRun.runId }),
        });
        if (!res.body) throw new Error("no stream");
        setPhase("streaming"); setOut("");
        const reader = res.body.getReader(); const dec = new TextDecoder();
        for (;;) { const { done, value } = await reader.read(); if (done || cancelled) break; setOut((o) => o + dec.decode(value, { stream: true })); }
      } catch { setOut(failedRun.diagnosis); }
      if (!cancelled) setPhase("done");
    })();
    return () => { cancelled = true; };
  }, [failedRun.runId, failedRun.diagnosis]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  // Re-execute: spawn a REAL process in the compass repo and stream its output live.
  async function reexecute() {
    setReexec("running"); setLog("");
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: failedRun.runId }) });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = "";
      for (;;) { const { done, value } = await reader.read(); if (done) break; acc += dec.decode(value, { stream: true }); setLog(acc); }
      const m = acc.match(/\[compass-run exit (\d+)\]/);
      setReexec(m && m[1] === "0" ? "done" : "failed");
    } catch { setReexec("failed"); }
    router.refresh();
  }

  return (
    <aside className="flex w-full flex-col border-l border-line bg-card lg:w-[340px] lg:shrink-0">
      <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="grid size-6 place-items-center rounded-[7px] bg-ink text-white">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5 13 13l-4.5 2.5L11 11l4.5-2.5Z" fill="currentColor" stroke="none" /></svg>
          </div>
          <span className="text-[13.5px] font-semibold text-ink">Execution help</span>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-shell hover:text-ink" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-shell/60 px-4 py-2.5 text-[11.5px]">
        <span className="text-faint">Scoped to</span>
        <span className="rounded-pill bg-brand-weak px-2 py-0.5 font-medium text-brand-ink">{role.title}</span>
        <span className="mono rounded-pill bg-card px-2 py-0.5 text-muted ring-1 ring-line">{failedRun.runId}</span>
        <span className="ml-auto text-faint">diagnose · re-run only</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <div className="rounded-tile border border-bad-weak bg-bad-weak/50 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-block size-1.5 rounded-pill bg-bad" />
            <span className="text-[12.5px] font-semibold text-ink">Run stopped</span>
            <span className="mono ml-auto text-[11px] text-muted">{failedRun.failedStep}</span>
          </div>
          <p className="mono mt-1.5 text-[11.5px] leading-snug text-bad">{failedRun.error}</p>
          <p className="mt-1 text-[11.5px] text-muted">{failedRun.story}</p>
        </div>

        <div className="flex gap-2.5">
          <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-weak text-[10px] font-bold text-brand-ink">AI</div>
          <div className="min-w-0 flex-1">
            {phase === "thinking" ? (
              <div className="flex items-center gap-1.5 py-1 text-[12.5px] text-muted">
                <span className="size-1.5 animate-bounce rounded-pill bg-faint [animation-delay:-0.2s]" />
                <span className="size-1.5 animate-bounce rounded-pill bg-faint [animation-delay:-0.1s]" />
                <span className="size-1.5 animate-bounce rounded-pill bg-faint" />
                <span className="ml-1">reading the run…</span>
              </div>
            ) : (
              <p className={`text-[13px] leading-relaxed text-body ${phase === "streaming" ? "caret" : ""}`}>{out}</p>
            )}
          </div>
        </div>

        {/* live execution log — real process spawned in the compass repo */}
        {reexec !== "idle" && (
          <div className="overflow-hidden rounded-tile border border-line">
            <div className="flex items-center gap-2 border-b border-line bg-ink px-3 py-1.5">
              {reexec === "running" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9aa1ad" strokeWidth="2.4" strokeLinecap="round" className="animate-spin"><path d="M12 3a9 9 0 1 0 9 9" /></svg>
              ) : (
                <span className={`inline-block size-2 rounded-pill ${reexec === "done" ? "bg-good" : "bg-bad"}`} />
              )}
              <span className="text-[11px] font-medium text-white/90">
                {reexec === "running" ? "executing on the orchestrator…" : reexec === "done" ? "checks passed · run resolved" : "checks failed"}
              </span>
              <span className="mono ml-auto text-[10px] text-white/40">compass.orchestrator</span>
            </div>
            <pre ref={logRef} className="mono max-h-40 overflow-y-auto bg-[#0e1420] px-3 py-2 text-[10.5px] leading-relaxed text-[#c8cdd6]">
              {log || "starting…"}
            </pre>
          </div>
        )}
      </div>

      <div className="border-t border-line p-3">
        {reexec === "done" ? (
          <button onClick={onClose} className="w-full rounded-lg border border-line bg-card px-3 py-2.5 text-[13px] font-medium text-body hover:bg-shell">Done — close</button>
        ) : (
          <button
            disabled={phase !== "done" || reexec === "running"}
            onClick={reexecute}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={reexec === "running" ? "animate-spin" : ""}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
            {reexec === "running" ? "Re-executing…" : reexec === "failed" ? "Retry re-execute" : `Re-execute from ${failedRun.resumeFrom}`}
          </button>
        )}
        <div className="mt-2 flex items-center justify-between px-0.5">
          <span className="text-[12px] text-muted">Guarded · this run only</span>
          <span className="text-[11px] text-faint">real process · tracked</span>
        </div>
      </div>
    </aside>
  );
}
