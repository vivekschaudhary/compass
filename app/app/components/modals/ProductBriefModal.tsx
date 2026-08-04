"use client";

import { useEffect, useState } from "react";
import { runStreamed } from "@/app/lib/exec-client";
import { Action } from "../ui/PlaybookEditor";
import { Modal } from "../ui/Modal";
import { ExecLog } from "../ui/ExecLog";
import { Spinner } from "../ui/Spinner";

// PM — the engagement's product brief, drafted from SOURCE MATERIAL.
//
// Deliberately no ticket picker: this is engagement-scoped, not ticket-scoped. By default it reads
// the SOW already scaffolded at `02-scope/sow` in the docs provider, so the normal path is one
// click. The textarea is an override for when the SOW isn't in the provider yet (or you want to
// brief from a vision statement / workshop notes instead).
export function ProductBriefModal({ open, onClose, engagementId, actor, onDone, providerLabel }: {
  open: boolean; onClose: () => void; engagementId: string; actor?: string; onDone: () => void;
  providerLabel: string;
}) {
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [log, setLog] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) { setSource(""); setErr(null); setUrl(null); setLog(""); setDone(false); }
  }, [open]);

  async function run() {
    setBusy(true); setErr(null); setLog(""); setUrl(null);
    try {
      const r = await runStreamed<{ ok?: boolean; url?: string | null; wrote?: boolean; gated?: boolean; actions?: Action[] }>(
        "/api/product-brief", { engagementId, source: source.trim() || undefined, actor }, setLog,
      );
      if (!r.ok) { setErr("Could not draft the product brief — see the log."); return; }
      setUrl(r.url ?? null); setDone(true); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} busy={busy}
      title="Draft the product brief"
      subtitle={`Your PM agent drafts it from the SOW in ${providerLabel}, then hands it to you for approval.`}>

      <label className="mt-4 block">
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">
          Source material <span className="text-faint/70">· optional</span>
        </span>
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          rows={6}
          placeholder={`Leave blank to use the SOW already in ${providerLabel} (02-scope/sow).\n\nOr paste a vision statement, workshop notes, or the SOW text to brief from that instead.`}
          className="mt-1 w-full resize-none rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand"
        />
        <span className="mt-1 block text-[11.5px] text-muted">
          The brief lands in <span className="mono">01-foundation/product-brief</span> — the page your
          research and downstream workflows read.
        </span>
      </label>

      {err && <p className="mt-3 rounded-lg border border-bad-line bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{err}</p>}
      {done && (
        <p className="mt-3 rounded-lg border border-good-line bg-good-weak/50 px-3 py-2 text-[12px] text-good">
          Product brief drafted.{url && <> · <a href={url} target="_blank" rel="noreferrer" className="underline">open doc ↗</a></>}
        </p>
      )}

      <ExecLog log={log} />

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} disabled={busy}
          className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-body hover:bg-shell disabled:opacity-50">
          {done ? "Close" : "Cancel"}
        </button>
        {!done && (
          <button onClick={run} disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-ink disabled:opacity-50">
            {busy && <Spinner />}{busy ? "Drafting…" : "Draft brief"}
          </button>
        )}
      </div>
    </Modal>
  );
}
