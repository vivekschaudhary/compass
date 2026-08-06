"use client";

import { useState } from "react";
import { slotByName, defaultProvider, missingRequired } from "@/app/lib/adapters";
import { AdapterConfig } from "@/app/components/ui/AdapterConfig";
import { useRouter } from "next/navigation";

type IntakeQuestion = {
  key: string; prompt: string; type: "choice" | "number" | "text"; options?: string[]; field: string; because?: string;
};
type Extracted = {
  name: string; client: string; sow: string; pricing: string; budget: number; months: number;
  quality_bar: string; deliverables: { code: string; title: string; acceptance: string }[];
  team?: { name: string; role: string; title?: string }[];
  questions?: IntakeQuestion[];
};

// Engagement-column fields patch `data` directly; a "member:<role>" field adds a named person to team.
function applyAnswer(data: Extracted, q: IntakeQuestion, value: string): Extracted {
  const v = value.trim();
  if (q.field.startsWith("member:")) {
    const role = q.field.slice(7);
    const team = [...(data.team ?? []).filter((t) => t.role !== role), { name: v, role }];
    return { ...data, team };
  }
  if (q.field === "budget" || q.field === "months") return { ...data, [q.field]: Number(v.replace(/[^0-9.]/g, "")) || 0 };
  return { ...data, [q.field]: v };
}

const SAMPLE = `STATEMENT OF WORK — SOW-3187
Client: Northwind Retail  |  Vendor: (consultancy)  |  Pricing: Fixed-bid, $620,000  |  Term: 5 months

Scope: Design and build a customer loyalty platform (web + mobile-responsive).
Deliverables:
  1. Discovery & solution design — user research summary + technical approach, accepted by client (weeks 1–3).
  2. Loyalty accounts & auth — SSO sign-in, points balance, tier status per §3.1.
  3. Rewards catalog — browse/redeem rewards, inventory sync per §3.2.
  4. Member dashboard — activity, points, personalized offers per §3.3.
  5. Launch & handover — production launch, runbook, 2-week hypercare.
Quality: WCAG 2.1 AA, 99.9% uptime, p95 < 400ms. Any scope beyond the above is a change request.`;

export default function NewEngagement() {
  const router = useRouter();
  const [sow, setSow] = useState("");
  // Phase A (setup → provisioning) runs BEFORE the SOW. The SOW is the root basis of everything
  // downstream, so it belongs in the doc store at `02-scope/sow` — which needs the store wired,
  // which needs the engagement row to exist. See compass/framework/engagement-setup.md.
  const [phase, setPhase] = useState<"setup" | "provisioning" | "input" | "analyzing" | "preview" | "clarify" | "creating">("setup");
  const [engagementId, setEngagementId] = useState("");
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  // Adapter slots are registry-driven (lib/adapters.ts): the chosen provider decides which
  // fields exist, so this screen never hardcodes "if confluence, show space key".
  const [docsProvider, setDocsProvider] = useState(defaultProvider("docs"));
  const [ticketsProvider, setTicketsProvider] = useState(defaultProvider("tickets"));
  const [conn, setConn] = useState<Record<string, string>>({});
  const setConnValue = (k: string, v: string) => setConn((c) => ({ ...c, [k]: v }));
  const missing = [
    ...missingRequired("docs", docsProvider, conn),
    ...missingRequired("tickets", ticketsProvider, conn),
  ];
  const [readiness, setReadiness] = useState<{ ok: boolean; checks: { key: string; label: string; ok: boolean; detail: string; remedy?: string }[] } | null>(null);
  // What closing Phase A actually produced — reported, not assumed. A local-only fallback (`jira:
  // false`) is the case worth seeing: setup "worked" but the board is still empty.
  const [sprint0, setSprint0] = useState<{ created: number; jira: boolean; closed: number } | null>(null);
  const [data, setData] = useState<Extracted | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const openQuestions = data?.questions ?? [];

  // Phase A: create the container, scaffold the doc tree, then ASSERT it is provisioned.
  // Asserting rather than assuming is the whole point — an unscaffolded tree fails silently
  // later, at the moment a workflow has already done its work.
  async function provision() {
    setPhase("provisioning"); setError(""); setReadiness(null); setSprint0(null);
    try {
      let id = engagementId;
      if (!id) {
        const r = await fetch("/api/intake", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "provision", provision: {
            name, client, docs_provider: docsProvider, tickets_provider: ticketsProvider, ...conn } }),
        });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || "could not create the engagement");
        id = j.id as string;
        setEngagementId(id);
      }
      await fetch("/api/scaffold", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId: id }),
      });
      const rr = await fetch(`/api/readiness?engagementId=${encodeURIComponent(id)}`);
      const rj = await rr.json();
      setReadiness(rj.readiness ?? null);
      if (rj.readiness?.ok) {
        // Phase A is over: the container is provisioned AND proven. Only now does the kickoff
        // backlog get cut, into a tracker we just watched respond. Its first ticket ("Connect
        // systems of record") is what these checks assert, so it lands already Done.
        const cr = await fetch("/api/intake", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "complete-phase-a", engagementId: id }),
        });
        const cj = await cr.json();
        if (!cj.ok) throw new Error(cj.error || "could not complete setup");
        setSprint0({ created: cj.sprint0 ?? 0, jira: Boolean(cj.sprint0InJira), closed: cj.closed ?? 0 });
        setPhase("input");
      } else setPhase("provisioning");
    } catch (e) { setError(e instanceof Error ? e.message : "failed"); setPhase("setup"); }
  }

  async function analyze() {
    setPhase("analyzing"); setError("");
    try {
      const r = await fetch("/api/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "analyze", sow }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "analyze failed");
      setData(j.data); setPhase("preview");
    } catch (e) { setError(e instanceof Error ? e.message : "failed"); setPhase("input"); }
  }

  async function create() {
    const prev = phase;
    setPhase("creating");
    try {
      // apply the answered questions to the payload; carry only the UNanswered forward — those
      // persist as the Delivery Manager agent's jobs-to-do. [agent-asks-structured-questions]
      let finalData = data!;
      const unanswered: IntakeQuestion[] = [];
      for (const q of openQuestions) {
        const a = answers[q.key];
        if (a && a.trim()) finalData = applyAnswer(finalData, q, a);
        else unanswered.push(q);
      }
      finalData = { ...finalData, questions: unanswered };
      // Carry the provisioned engagement id so Phase B FILLS the Phase A container rather than
      // creating a second engagement and orphaning the connectors + scaffolded tree.
      const r = await fetch("/api/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "create", data: finalData, engagementId: engagementId || undefined }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "create failed");
      document.cookie = `compass_eng=${j.engagementId}; path=/; max-age=31536000`;
      router.push("/");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "failed"); setPhase(prev === "clarify" ? "clarify" : "preview"); }
  }

  return (
    <div className="min-h-screen bg-shell">
      <header className="flex items-center justify-between border-b border-line bg-card px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-[9px] bg-ink text-white">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5 13 13l-4.5 2.5L11 11l4.5-2.5Z" fill="currentColor" stroke="none" /></svg>
          </div>
          <div className="leading-tight">
            <div className="text-[14.5px] font-semibold text-ink">New engagement</div>
            <div className="text-[11px] text-faint">Intake a SOW — Compass extracts the guardrails</div>
          </div>
        </div>
        <a href="/" className="text-[13px] font-medium text-muted hover:text-ink">← Dashboard</a>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-8">
        {error && <div className="mb-4 rounded-tile border border-bad-weak bg-bad-weak/60 px-4 py-3 text-[12.5px] text-bad">{error}</div>}

        {/* ── Phase A · setup ─────────────────────────────────────────────── */}
        {phase === "setup" && (
          <section className="rounded-card border border-line bg-card p-5">
            <h1 className="text-[15px] font-semibold text-ink">Set up the engagement</h1>
            <p className="mt-1 text-[12.5px] text-muted">
              Where this engagement&apos;s documents and tickets live. This comes first because the SOW
              itself gets filed in the doc store — so there is one traceable copy everything else derives from.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Engagement name</span>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Store Replenishment"
                  className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Client</span>
                <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Northwind Retail"
                  className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
              </label>
            </div>

            <div className="mt-4 border-t border-line pt-4">
              <AdapterConfig slot={slotByName("docs")} provider={docsProvider} onProvider={setDocsProvider}
                values={conn} onValue={setConnValue} />
            </div>

            <div className="mt-4 border-t border-line pt-4">
              <AdapterConfig slot={slotByName("tickets")} provider={ticketsProvider} onProvider={setTicketsProvider}
                values={conn} onValue={setConnValue} />
              <p className="mt-2 text-[11.5px] text-muted">
                The board needs an <span className="mono">Awaiting HITL approval</span> status — without it, human
                approval gates fail silently. We verify it next.
              </p>
            </div>

            <div className="mt-5 flex justify-end">
              <button onClick={provision} disabled={!name.trim() || !client.trim() || missing.length > 0}
                title={missing.length ? `Still needed: ${missing.map((f) => f.label).join(", ")}` : undefined}
                className="rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40">
                Set up and check
              </button>
            </div>
          </section>
        )}

        {/* ── Phase A · provisioning result ───────────────────────────────── */}
        {phase === "provisioning" && (
          <section className="rounded-card border border-line bg-card p-5">
            <h1 className="text-[15px] font-semibold text-ink">Provisioning</h1>
            <p className="mt-1 text-[12.5px] text-muted">Creating the engagement, scaffolding the doc tree, then checking it can actually run.</p>

            {!readiness && <p className="mt-4 text-[12.5px] text-muted">Working…</p>}

            {readiness && (
              <>
                <ul className="mt-4 space-y-2">
                  {readiness.checks.map((c) => (
                    <li key={c.key} className="flex gap-2.5 rounded-tile border border-line px-3 py-2.5">
                      <span className={c.ok ? "text-good" : "text-bad"}>{c.ok ? "✓" : "✗"}</span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-ink">{c.label} <span className="mono text-[11px] text-faint">{c.key}</span></div>
                        <div className="text-[12px] text-muted">{c.detail}</div>
                        {!c.ok && c.remedy && <div className="mt-0.5 text-[12px] text-warn">→ {c.remedy}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex justify-between">
                  <button onClick={() => setPhase("setup")} className="text-[12.5px] font-medium text-muted hover:text-ink">← Change setup</button>
                  <button onClick={provision} className="rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-body hover:bg-shell">Re-check</button>
                </div>
              </>
            )}
          </section>
        )}

        {(phase === "input" || phase === "analyzing") && (
          <section className="rounded-card border border-line bg-card p-5">
            {sprint0 && sprint0.created > 0 && (
              <div className={`mb-4 rounded-tile border px-4 py-3 text-[12.5px] ${sprint0.jira ? "border-good-line bg-good-weak/50 text-good" : "border-warn-weak bg-warn-weak/50 text-warn"}`}>
                {sprint0.jira
                  ? <>Setup complete — Sprint 0 created on the board: {sprint0.created} tickets{sprint0.closed > 0 && <>, {sprint0.closed} already done</>}.</>
                  : <>Setup complete, but Jira didn&apos;t accept the tickets — Sprint 0 exists locally only ({sprint0.created}). Fix the connector in Settings, then re-provision.</>}
              </div>
            )}
            <div className="flex items-center justify-between">
              <h1 className="text-[15px] font-semibold text-ink">Paste the Statement of Work</h1>
              <button onClick={() => setSow(SAMPLE)} className="text-[12.5px] font-medium text-brand hover:text-brand-ink">Use a sample SOW</button>
            </div>
            <p className="mt-1 text-[12.5px] text-muted">Compass reads it faithfully — scope, deliverables, pricing, timeline, quality — and turns it into your program guardrails. It won&apos;t invent scope.</p>
            <textarea
              value={sow}
              onChange={(e) => setSow(e.target.value)}
              placeholder="Paste the SOW text here…"
              className="mono mt-3 h-64 w-full resize-y rounded-tile border border-line bg-shell/40 px-3 py-2.5 text-[12px] leading-relaxed text-body outline-none focus:border-brand"
            />
            <button
              onClick={analyze}
              disabled={sow.trim().length < 40 || phase === "analyzing"}
              className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {phase === "analyzing" ? (
                <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin"><path d="M12 3a9 9 0 1 0 9 9" /></svg> Compass is reading the SOW…</>
              ) : "Analyze SOW"}
            </button>
          </section>
        )}

        {(phase === "preview" || phase === "creating") && data && (
          <section className="rise rounded-card border border-line bg-card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h1 className="text-[15px] font-semibold text-ink">Extracted engagement</h1>
                <p className="mt-0.5 text-[12.5px] text-muted">Review what Compass read from the SOW, then create it.</p>
              </div>
              <span className="rounded-pill bg-good-weak px-2.5 py-1 text-[12px] font-medium text-good">AI extracted</span>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-4">
              <Field k="Engagement" v={data.name} />
              <Field k="Client" v={data.client} />
              <Field k="SOW" v={data.sow} mono />
              <Field k="Pricing" v={data.pricing} />
              <Field k="Budget" v={`$${(data.budget / 1000).toFixed(0)}k`} />
              <Field k="Timeline" v={`${data.months} months`} />
              <Field k="Quality bar" v={data.quality_bar} span />
            </div>

            <div className="border-t border-line px-5 py-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Deliverables ({data.deliverables.length}) — the scope guardrail</div>
              <div className="mt-2 flex flex-col gap-1.5">
                {data.deliverables.map((d) => (
                  <div key={d.code} className="flex gap-3 rounded-tile border border-line px-3 py-2.5">
                    <span className="mono mt-0.5 shrink-0 rounded-pill bg-brand-weak px-2 py-0.5 text-[11px] font-semibold text-brand-ink">{d.code}</span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-ink">{d.title}</div>
                      <div className="text-[12px] text-muted">{d.acceptance}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-line px-5 py-4">
              <button onClick={() => setPhase("input")} className="text-[12.5px] font-medium text-muted hover:text-ink">← Re-analyze</button>
              {openQuestions.length > 0 ? (
                <button onClick={() => setPhase("clarify")} disabled={phase === "creating"} className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40">
                  {`Continue — ${openQuestions.length} question${openQuestions.length === 1 ? "" : "s"} →`}
                </button>
              ) : (
                <button onClick={create} disabled={phase === "creating"} className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40">
                  {phase === "creating" ? "Creating…" : "Create engagement →"}
                </button>
              )}
            </div>
          </section>
        )}

        {phase === "clarify" && data && (
          <section className="rise rounded-card border border-line bg-card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h1 className="text-[15px] font-semibold text-ink">The Delivery Manager agent has questions</h1>
                <p className="mt-0.5 text-[12.5px] text-muted">Compass won&apos;t guess what the SOW doesn&apos;t state. Answer what you can — anything you skip becomes a job in the Delivery Manager&apos;s queue.</p>
              </div>
              <span className="rounded-pill bg-warn-weak px-2.5 py-1 text-[12px] font-medium text-warn">{openQuestions.length} to clarify</span>
            </div>

            <div className="flex flex-col gap-3 px-5 py-4">
              {openQuestions.map((q) => (
                <div key={q.key} className="rounded-tile border border-line px-4 py-3">
                  <div className="text-[13px] font-medium text-ink">{q.prompt}</div>
                  {q.because && <div className="mt-0.5 text-[12px] text-muted">{q.because}</div>}
                  <div className="mt-2">
                    {q.type === "choice" ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(q.options ?? []).map((o) => (
                          <button key={o} onClick={() => setAnswers((a) => ({ ...a, [q.key]: o }))} className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${answers[q.key] === o ? "border-brand bg-brand-weak text-brand-ink" : "border-line bg-card text-body hover:bg-shell"}`}>{o}</button>
                        ))}
                      </div>
                    ) : (
                      <input
                        type={q.type === "number" ? "number" : "text"}
                        value={answers[q.key] ?? ""}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                        placeholder={q.type === "number" ? "Enter a number" : "Type your answer…"}
                        className="w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-line px-5 py-4">
              <button onClick={() => setPhase("preview")} className="text-[12.5px] font-medium text-muted hover:text-ink">← Back</button>
              <button onClick={create} className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40">
                Create engagement →
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Field({ k, v, mono, span }: { k: string; v: string; mono?: boolean; span?: boolean }) {
  return (
    <div className={span ? "col-span-2 sm:col-span-4" : ""}>
      <div className="text-[11px] uppercase tracking-wide text-faint">{k}</div>
      <div className={`mt-0.5 text-[13px] font-medium text-ink ${mono ? "mono" : ""}`}>{v}</div>
    </div>
  );
}
