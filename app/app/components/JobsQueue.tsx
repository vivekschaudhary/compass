"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Job, JobKind, Role, Activity, GENERIC_WORKFLOWS } from "@/app/lib/data";
import type { Anchor } from "@/app/lib/agent-client";
import { relatedLink } from "@/app/lib/format";
import { HistoryTable } from "./HistoryTable";

function KindIcon({ kind }: { kind: JobKind }) {
  const p: Record<JobKind, React.ReactNode> = {
    review: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12l2.2 2.2 4.8-4.8" /></>,
    approve: <><circle cx="12" cy="12" r="9" /><path d="M8.5 12.2l2.3 2.3 4.7-4.9" /></>,
    deliver: <><path d="M21 8l-9-5-9 5 9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /></>,
    blocked: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
    drafting: <><path d="M12 3a9 9 0 1 0 9 9" /></>,
    build: <><polygon points="6 3 20 12 6 21 6 3" /></>,
    question: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.9-1.2 1.6v.5" /><path d="M12 17h.01" /></>,
    staffing: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  };
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {p[kind]}
    </svg>
  );
}

const ICON_WRAP: Record<JobKind, string> = {
  review: "bg-brand-weak text-brand-ink",
  approve: "bg-good-weak text-good",
  deliver: "bg-warn-weak text-warn",
  blocked: "bg-bad-weak text-bad",
  drafting: "bg-shell text-faint",
  build: "bg-ink text-white",
  question: "bg-brand-weak text-brand-ink",
  staffing: "bg-brand-weak text-brand-ink",
};

function JobCard({
  job, onGetHelp, onAction, busy, actor, atlassianBase,
}: {
  job: Job;
  onGetHelp: (anchor?: Anchor) => void;
  onAction: (jobId: string, which: "primary" | "secondary") => void;
  busy: boolean;
  actor?: string;
  atlassianBase?: string;
}) {
  const relLink = relatedLink(job.related, atlassianBase ?? "");
  const router = useRouter();
  const drafting = job.kind === "drafting";
  const blocked = job.kind === "blocked";
  const isBuild = job.kind === "build";
  const isQuestion = job.kind === "question";
  const isStaffing = job.kind === "staffing";
  const [bstate, setBstate] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [log, setLog] = useState("");
  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  async function build() {
    setBstate("running"); setLog("");
    try {
      const res = await fetch("/api/build", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id, story: job.related, actor }) });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = "";
      for (;;) { const { done, value } = await reader.read(); if (done) break; acc += dec.decode(value, { stream: true }); setLog(acc); }
      const m = acc.match(/\[compass-run exit (\d+)\]/);
      setBstate(m && m[1] === "0" ? "done" : "failed");
    } catch { setBstate("failed"); }
    router.refresh();
  }

  return (
    <div className={`rise flex flex-col rounded-tile border border-line bg-card transition-opacity ${busy ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-start gap-3 px-4 py-3.5">
        <div className={`grid size-9 shrink-0 place-items-center rounded-[10px] ${ICON_WRAP[job.kind]}`}>
          <KindIcon kind={job.kind} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13.5px] font-semibold text-ink">{job.title}</p>
            {job.related && (relLink
              ? <a href={relLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mono inline-flex items-center gap-0.5 text-[11px] text-brand hover:underline">{job.related}<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg></a>
              : <span className="mono text-[11px] text-faint">{job.related}</span>)}
            {job.meta && (
              <span className={`rounded-pill px-2 py-0.5 text-[11px] font-medium ${
                job.tone === "bad" ? "bg-bad-weak text-bad" : job.tone === "warn" ? "bg-warn-weak text-warn" : "bg-shell text-muted"
              }`}>{job.meta}</span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">{job.subtitle}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {drafting ? (
            <span className="flex items-center gap-1.5 text-[12px] text-faint">
              <span className="size-1.5 animate-bounce rounded-pill bg-faint [animation-delay:-0.2s]" />
              <span className="size-1.5 animate-bounce rounded-pill bg-faint [animation-delay:-0.1s]" />
              <span className="size-1.5 animate-bounce rounded-pill bg-faint" />
              <span className="ml-1">agent working…</span>
            </span>
          ) : isBuild ? (
            <button
              disabled={bstate === "running"}
              onClick={build}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={bstate === "running" ? "animate-spin" : ""}>
                {bstate === "running" ? <path d="M12 3a9 9 0 1 0 9 9" /> : <polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none" />}
              </svg>
              {bstate === "running" ? "Building…" : bstate === "failed" ? "Retry build" : job.primary ?? "Build"}
            </button>
          ) : (
            <>
              {job.secondary && (
                <button disabled={busy} onClick={() => onAction(job.id, "secondary")} className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-muted hover:text-ink disabled:opacity-50">{job.secondary}</button>
              )}
              {job.primary && (
                <button
                  disabled={busy}
                  onClick={() => (blocked ? onGetHelp(job.related ? { kind: "ticket", id: job.related } : { kind: "job", id: job.id }) : onAction(job.id, "primary"))}
                  className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-opacity disabled:opacity-50 ${
                    job.tone === "bad" ? "bg-bad text-white hover:opacity-90" : blocked ? "border border-line-2 bg-card text-body hover:bg-shell" : "bg-brand text-white hover:opacity-90"
                  }`}
                >
                  {busy ? "…" : job.primary}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* the agent asked — answer inline; the structured value patches state directly */}
      {isQuestion && job.question && <QuestionControl q={job.question} />}

      {/* one grouped card to name every unstaffed role — answer together, skip any to staff later */}
      {isStaffing && job.staffing && <StaffingControl items={job.staffing} />}

      {/* live build log — a real process spawned in the compass repo */}
      {isBuild && bstate !== "idle" && (
        <div className="mx-3 mb-3 overflow-hidden rounded-tile border border-line">
          <div className="flex items-center gap-2 border-b border-line bg-ink px-3 py-1.5">
            {bstate === "running" ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9aa1ad" strokeWidth="2.4" strokeLinecap="round" className="animate-spin"><path d="M12 3a9 9 0 1 0 9 9" /></svg>
            ) : (
              <span className={`inline-block size-2 rounded-pill ${bstate === "done" ? "bg-good" : "bg-bad"}`} />
            )}
            <span className="text-[10.5px] font-medium text-white/90">
              {bstate === "running" ? "building on the orchestrator…" : bstate === "done" ? "checks green · merged" : "build failed"}
            </span>
            <span className="mono ml-auto text-[10px] text-white/40">{job.related}</span>
          </div>
          <pre ref={logRef} className="mono max-h-36 overflow-y-auto bg-[#0e1420] px-3 py-2 text-[10px] leading-relaxed text-[#c8cdd6]">{log || "starting…"}</pre>
        </div>
      )}
    </div>
  );
}

// The inline answer control on a `question` job — a structured pick (choice) / field (number|text)
// that patches the allowlisted target directly and clears the question on save. [agent-asks-structured-questions]
function QuestionControl({ q }: { q: NonNullable<Job["question"]> }) {
  const router = useRouter();
  const [value, setValue] = useState(q.type === "choice" ? (q.options?.[0] ?? "") : "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!value.trim() || saving) return;
    setSaving(true);
    try {
      await fetch("/api/questions/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: q.id, value }) });
      router.refresh();
    } catch { setSaving(false); }
  }

  return (
    <div className="mx-3 mb-3 flex flex-wrap items-center gap-2 rounded-tile border border-line bg-shell/40 px-3 py-2.5">
      {q.type === "choice" ? (
        <div className="flex flex-wrap gap-1.5">
          {(q.options ?? []).map((o) => (
            <button key={o} onClick={() => setValue(o)} className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${value === o ? "border-brand bg-brand-weak text-brand-ink" : "border-line bg-card text-body hover:bg-shell"}`}>{o}</button>
          ))}
        </div>
      ) : (
        <input
          type={q.type === "number" ? "number" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          placeholder={q.type === "number" ? "Enter a number" : "Type your answer…"}
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-body outline-none focus:border-brand"
        />
      )}
      <button onClick={save} disabled={!value.trim() || saving} className="ml-auto rounded-lg bg-brand px-3 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-40">
        {saving ? "Saving…" : "Save answer"}
      </button>
    </div>
  );
}

// The grouped "Staff the team" card — one row per unnamed role, saved together. Empty rows are
// skipped (staff later); each filled name patches that member via the batch answer endpoint.
function StaffingControl({ items }: { items: NonNullable<Job["staffing"]> }) {
  const router = useRouter();
  const [names, setNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const filled = items.filter((it) => (names[it.id] ?? "").trim()).length;

  async function save() {
    if (!filled || saving) return;
    setSaving(true);
    try {
      const answers = items.map((it) => ({ questionId: it.id, value: names[it.id] ?? "" })).filter((a) => a.value.trim());
      await fetch("/api/questions/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }) });
      router.refresh();
    } catch { setSaving(false); }
  }

  return (
    <div className="mx-3 mb-3 rounded-tile border border-line bg-shell/40 px-3 py-2.5">
      <div className="flex flex-col gap-1.5">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate text-[12.5px] font-medium text-body">{it.title}</span>
            <input
              value={names[it.id] ?? ""}
              onChange={(e) => setNames((n) => ({ ...n, [it.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              placeholder="Name…"
              className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-1.5 text-[13px] text-body outline-none focus:border-brand"
            />
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-end gap-2">
        <span className="text-[11.5px] text-muted">{filled} of {items.length} named</span>
        <button onClick={save} disabled={!filled || saving} className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-40">
          {saving ? "Saving…" : "Save team"}
        </button>
      </div>
    </div>
  );
}

// Per-role workflow catalog — every role's list of workflows, from the 17 Compass agents' tasks.
//
// #148: the `ready` flag that used to sit on these entries was DEAD — written on six of them and
// read by nothing. Enablement is, and was, `handlerFor()` below. So the flag said `false` for the
// 13 workflows the generic runner has been executing all along. A field that contradicts the
// behaviour it claims to describe is worse than no field. Removed rather than repaired: this whole
// map is replaced by the generated catalog in the next slice.
type Workflow = { key: string; label: string; hint?: string };
const ROLE_WORKFLOWS: Record<string, Workflow[]> = {
  pm: [{ key: "bet", label: "Create epic" }, { key: "brief", label: "Create brief" }, { key: "portfolio", label: "Bet portfolio" }],
  "product-owner": [{ key: "story", label: "Create story" }, { key: "refine", label: "Refine" }, { key: "sprint-review", label: "Sprint review" }, { key: "manage-sprint", label: "Manage sprint" }],
  researcher: [{ key: "research", label: "Run research" }],
  architect: [{ key: "tech-design", label: "Tech design" }, { key: "bet-architecture", label: "Epic architecture" }],
  "enterprise-architect": [{ key: "foundation-arch", label: "Foundation architecture" }],
  designer: [{ key: "design-spec", label: "Design spec" }],
  "ux-writer": [{ key: "copy", label: "Write copy" }],
  automation: [{ key: "e2e", label: "E2E tests" }],
  reviewer: [{ key: "review-pr", label: "Review PR" }],
  "security-reviewer": [{ key: "security-review", label: "Security review" }],
  scanner: [{ key: "scan", label: "Scan" }],
  "tech-writer": [{ key: "docs", label: "Update docs" }],
  support: [{ key: "triage", label: "Triage issue" }],
  gtm: [{ key: "launch-plan", label: "Launch plan" }, { key: "release-comms", label: "Release comms" }],
  sre: [{ key: "execute-change", label: "Execute change" }, { key: "runbook", label: "Author runbook" }],
  "delivery-manager": [{ key: "status", label: "Status roll-up" }],
  engineer: [{ key: "build", label: "Build", hint: "Run from a story card below" }, { key: "fix", label: "Fix", hint: "Run from a story card below" }],
};

export function JobsQueue({
  role, jobs, onGetHelp, onAction, busy, onCreateBet, onDecompose, onTriage, decomposing, activity, onCreateStory, onSprintReview, atlassianBase, onRunResearch, onRunWorkflow, onRefine,
}: {
  role: Role;
  jobs: Job[];
  onGetHelp: (anchor?: Anchor) => void;
  onAction: (jobId: string, which: "primary" | "secondary") => void;
  busy: string | null;
  onCreateBet?: () => void;
  onDecompose?: () => void;
  onTriage?: () => void;
  decomposing?: boolean;
  activity?: Activity[];
  onCreateStory?: () => void;
  onSprintReview?: () => void;
  atlassianBase?: string;
  onRunResearch?: () => void;
  onRunWorkflow?: (key: string) => void;
  onRefine?: () => void;
}) {
  const mine = jobs.filter((j) => j.role === role.roleCode);
  const actionable = mine.filter((j) => j.kind !== "drafting").length;
  const workflows = ROLE_WORKFLOWS[role.roleCode] ?? [];
  const history = (activity ?? []).filter((a) => a.role === role.roleCode);
  // Dedicated modals for the bespoke workflows; everything else routes through the generic runner.
  const HANDLERS: Record<string, (() => void) | undefined> = {
    bet: onCreateBet, story: onCreateStory, refine: onRefine, "sprint-review": onSprintReview, research: onRunResearch, triage: onTriage,
  };
  const handlerFor = (key: string): (() => void) | undefined =>
    HANDLERS[key] ?? (GENERIC_WORKFLOWS[key] && onRunWorkflow ? () => onRunWorkflow(key) : undefined);

  return (
    <section className="rounded-card border border-line bg-card rise">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Your jobs to do</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">Drafted by your {role.title.toLowerCase()} agent · awaiting your review.</p>
        </div>
        <span className="tnum rounded-pill bg-brand-weak px-2.5 py-1 text-[12px] font-medium text-brand-ink">{actionable} to action</span>
      </div>

      {workflows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-shell/40 px-5 py-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Workflows</span>
          {workflows.map((w) => {
            const handler = handlerFor(w.key);
            if (handler) {
              return (
                <button key={w.key} onClick={handler} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-[12.5px] font-medium text-body hover:border-brand hover:bg-shell">
                  <span className="inline-block size-1.5 rounded-pill bg-good" />{w.label}
                </button>
              );
            }
            return (
              <span key={w.key} title={w.hint ?? "Declared — not yet wired"} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-[12.5px] font-medium text-faint">
                {w.label}<span className="rounded-pill bg-shell px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide">{w.hint ? "card" : "soon"}</span>
              </span>
            );
          })}
        </div>
      )}

      {mine.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <div className="mx-auto grid size-10 place-items-center rounded-full bg-good-weak text-good">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <p className="mt-2 text-[13.5px] font-medium text-ink">You&apos;re clear</p>
          <p className="text-[12.5px] text-muted">Nothing in your queue — your agent will surface work here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 p-3">
          {mine.map((j) => (
            <JobCard key={j.id} job={j} onGetHelp={onGetHelp} onAction={onAction} busy={busy === j.id} actor={role.name} atlassianBase={atlassianBase} />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="border-t border-line py-3">
          <div className="flex items-center justify-between px-5 pb-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-faint">History · {role.title}</span>
            <span className="tnum text-[11px] text-faint">{history.length}</span>
          </div>
          <HistoryTable rows={history} atlassianBase={atlassianBase} />
        </div>
      )}
    </section>
  );
}
