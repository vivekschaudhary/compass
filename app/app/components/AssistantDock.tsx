"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@/app/lib/data";
import { streamAgent, type ChatItem, type Anchor, type AgentEvent } from "@/app/lib/agent-client";
import { ConfirmCard } from "./agent/ConfirmCard";
import { ThreadList } from "./agent/ThreadList";

// Execution Help — a per-role agentic assistant. It reads real engagement state, advises, and takes
// allowlisted actions with per-write confirmation. Global by default; a thread can be anchored to a
// ticket/run/job. Streams NDJSON AgentEvents from /api/agent/turn (see app/lib/agent-loop.ts).
export function AssistantDock({ role, engagementId, anchor, onClose }: {
  role: Role;
  engagementId: string;
  anchor?: Anchor | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [showThreads, setShowThreads] = useState(false);
  // the anchor to attach when this (still-unsaved) thread's first turn is sent; cleared once saved
  const [pendingAnchor, setPendingAnchor] = useState<Anchor | null>(anchor ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [items]);

  // ── stream event handling (immutable updates) ──────────────────────────────
  function seal(list: ChatItem[]): ChatItem[] {
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (it.kind === "assistant") { if (it.streaming) list[i] = { ...it, streaming: false }; break; }
    }
    return list;
  }

  function onEvent(e: AgentEvent) {
    if (e.type === "thread") { setThreadId(e.id); setPendingAnchor(null); return; }
    setItems((prev) => {
      const next = prev.slice();
      if (e.type === "text") {
        const last = next[next.length - 1];
        if (last && last.kind === "assistant" && last.streaming) next[next.length - 1] = { ...last, text: last.text + e.delta };
        else next.push({ kind: "assistant", text: e.delta, streaming: true });
      } else if (e.type === "tool") {
        seal(next);
        if (e.phase === "start") next.push({ kind: "tool", name: e.name, phase: "start", summary: e.summary });
        else {
          let real = -1;
          for (let i = next.length - 1; i >= 0; i--) { const it = next[i]; if (it.kind === "tool" && it.name === e.name && it.phase === "start") { real = i; break; } }
          if (real >= 0) next[real] = { kind: "tool", name: e.name, phase: e.phase, summary: e.summary ?? (next[real] as Extract<ChatItem, { kind: "tool" }>).summary };
          else next.push({ kind: "tool", name: e.name, phase: e.phase, summary: e.summary });
        }
      } else if (e.type === "exec") {
        const last = next[next.length - 1];
        if (last && last.kind === "exec") next[next.length - 1] = { ...last, log: last.log + e.chunk };
        else { seal(next); next.push({ kind: "exec", log: e.chunk }); }
      } else if (e.type === "confirm") {
        seal(next);
        next.push({ kind: "confirm", toolUseId: e.toolUseId, name: e.name, input: e.input, summary: e.summary, state: "pending" });
      } else if (e.type === "error") {
        seal(next);
        next.push({ kind: "assistant", text: `⚠ ${e.message}` });
      } else if (e.type === "done") {
        seal(next);
      }
      return next;
    });
  }

  async function drive(body: Parameters<typeof streamAgent>[0]) {
    setBusy(true);
    try { await streamAgent(body, onEvent); }
    catch { setItems((prev) => [...seal(prev.slice()), { kind: "assistant", text: "⚠ The assistant stream dropped. Try again." }]); }
    finally { setBusy(false); setRefreshKey((k) => k + 1); router.refresh(); }
  }

  function send(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    setItems((prev) => [...prev, { kind: "user", text }]);
    setDraft("");
    drive({ threadId: threadId ?? undefined, engagementId, role: role.roleCode, anchor: threadId ? undefined : pendingAnchor ?? undefined, message: text });
  }

  function decide(toolUseId: string, approved: boolean) {
    setItems((prev) => prev.map((i) => (i.kind === "confirm" && i.toolUseId === toolUseId ? { ...i, state: approved ? "approved" : "denied" } : i)));
    drive({ threadId: threadId ?? undefined, confirm: { toolUseId, approved } });
  }

  async function pickThread(id: string) {
    setShowThreads(false);
    try {
      const res = await fetch(`/api/agent/thread?id=${encodeURIComponent(id)}`);
      const j = await res.json();
      const hydrated: ChatItem[] = (j.bubbles ?? []).map((b: { kind: string; text?: string; name?: string; ok?: boolean; summary?: string }) =>
        b.kind === "user" ? { kind: "user", text: b.text }
        : b.kind === "assistant" ? { kind: "assistant", text: b.text }
        : { kind: "tool", name: b.name, phase: b.ok ? "done" : "error", summary: b.summary });
      setPendingAnchor(null);
      setThreadId(id);
      setItems(hydrated);
    } catch { /* leave as-is */ }
  }

  function newChat() {
    setShowThreads(false);
    setItems([]);
    setPendingAnchor(null);
    setThreadId(null);
  }

  const hasPendingConfirm = items.some((i) => i.kind === "confirm" && i.state === "pending");
  const anchorId = pendingAnchor?.id;
  const anchorKind = pendingAnchor?.kind;
  const empty = items.length === 0;
  const lastKind = items[items.length - 1]?.kind;

  return (
    <aside className="flex h-full w-full flex-col border-l border-line bg-card lg:w-[360px] lg:shrink-0">
      {/* header */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="grid size-6 place-items-center rounded-[7px] bg-ink text-white">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5 13 13l-4.5 2.5L11 11l4.5-2.5Z" fill="currentColor" stroke="none" /></svg>
          </div>
          <span className="text-[13.5px] font-semibold text-ink">Execution help</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowThreads((s) => !s)} className="rounded-md p-1 text-muted hover:bg-shell hover:text-ink" aria-label="Threads" title="Conversations">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
          </button>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-shell hover:text-ink" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      </div>

      {/* scope line */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-shell/60 px-4 py-2.5 text-[11.5px]">
        <span className="text-faint">Scoped to</span>
        <span className="rounded-pill bg-brand-weak px-2 py-0.5 font-medium text-brand-ink">{role.title}</span>
        {anchorId && anchorKind && anchorKind !== "none" && (
          <span className="mono rounded-pill bg-card px-2 py-0.5 text-muted ring-1 ring-line">{anchorKind}: {anchorId}</span>
        )}
        <span className="ml-auto text-faint">reads · confirmed writes</span>
      </div>

      {showThreads && (
        <ThreadList engagementId={engagementId} role={role.roleCode} activeId={threadId} refreshKey={refreshKey} onPick={pickThread} onNew={newChat} />
      )}

      {/* transcript */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {empty && (
          <div className="space-y-3">
            <div className="flex gap-2.5">
              <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-weak text-[10px] font-bold text-brand-ink">AI</div>
              <p className="text-[13px] leading-relaxed text-body">
                I can read this engagement&rsquo;s tickets and runs, help you diagnose an issue, and take actions — moving a ticket, patching a field, posting a comment, or re-running the orchestrator — with your OK on every write.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-8">
              {(anchorKind === "run"
                ? ["Diagnose this run", "What failed and why?"]
                : anchorKind === "ticket"
                ? [`Why is ${anchorId} blocked?`, "What's the next step here?"]
                : ["What needs my attention?", "Show my in-progress tickets"]
              ).map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="rounded-pill border border-line bg-card px-2.5 py-1 text-[11.5px] text-muted hover:bg-shell hover:text-ink">{s}</button>
              ))}
            </div>
          </div>
        )}

        {items.map((it, i) => {
          if (it.kind === "user") return (
            <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-tile bg-ink px-3 py-2 text-[13px] leading-relaxed text-white">{it.text}</div></div>
          );
          if (it.kind === "assistant") return (
            <div key={i} className="flex gap-2.5">
              <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-weak text-[10px] font-bold text-brand-ink">AI</div>
              <p className={`min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-relaxed text-body ${it.streaming ? "caret" : ""}`}>{it.text}</p>
            </div>
          );
          if (it.kind === "tool") return (
            <div key={i} className="flex items-center gap-1.5 pl-8 text-[11.5px]">
              <span className={`inline-block size-1.5 rounded-pill ${it.phase === "error" ? "bg-bad" : it.phase === "done" ? "bg-good" : "bg-faint animate-pulse"}`} />
              <span className="mono text-muted">{it.name}</span>
              {it.summary && <span className="truncate text-faint">— {it.summary}</span>}
            </div>
          );
          if (it.kind === "exec") return (
            <div key={i} className="overflow-hidden rounded-tile border border-line">
              <div className="flex items-center gap-2 border-b border-line bg-ink px-3 py-1.5">
                <span className="mono text-[10px] text-white/50">compass.orchestrator</span>
              </div>
              <pre className="mono max-h-44 overflow-y-auto bg-[#0e1420] px-3 py-2 text-[10.5px] leading-relaxed text-[#c8cdd6]">{it.log || "starting…"}</pre>
            </div>
          );
          if (it.kind === "confirm") return (
            <div key={i} className="pl-8"><ConfirmCard name={it.name} summary={it.summary} input={it.input} state={it.state} onDecide={(a) => decide(it.toolUseId, a)} /></div>
          );
          return null;
        })}

        {busy && !hasPendingConfirm && lastKind !== "assistant" && (
          <div className="flex items-center gap-1.5 pl-8 py-1 text-[12.5px] text-muted">
            <span className="size-1.5 animate-bounce rounded-pill bg-faint [animation-delay:-0.2s]" />
            <span className="size-1.5 animate-bounce rounded-pill bg-faint [animation-delay:-0.1s]" />
            <span className="size-1.5 animate-bounce rounded-pill bg-faint" />
          </div>
        )}
      </div>

      {/* composer */}
      <div className="border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-xl border border-line bg-shell px-2.5 py-2 focus-within:ring-1 focus-within:ring-brand">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
            rows={1}
            placeholder={hasPendingConfirm ? "Approve or deny the action above…" : "Ask about a ticket, run, or blocker…"}
            disabled={hasPendingConfirm}
            className="max-h-28 min-h-[20px] flex-1 resize-none bg-transparent text-[13px] leading-relaxed text-body outline-none placeholder:text-faint disabled:opacity-50"
          />
          <button onClick={() => send(draft)} disabled={busy || hasPendingConfirm || !draft.trim()}
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand text-white transition-opacity hover:opacity-90 disabled:opacity-30" aria-label="Send">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-0.5">
          <span className="text-[11px] text-faint">Guarded · every write needs your OK</span>
          <span className="text-[11px] text-faint">real state · tracked</span>
        </div>
      </div>
    </aside>
  );
}
