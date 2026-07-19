"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Extracted = {
  name: string; client: string; sow: string; pricing: string; budget: number; months: number;
  quality_bar: string; deliverables: { code: string; title: string; acceptance: string }[];
};

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
  const [phase, setPhase] = useState<"input" | "analyzing" | "preview" | "creating">("input");
  const [data, setData] = useState<Extracted | null>(null);
  const [error, setError] = useState("");

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
    setPhase("creating");
    try {
      const r = await fetch("/api/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "create", data }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "create failed");
      document.cookie = `compass_eng=${j.engagementId}; path=/; max-age=31536000`;
      router.push("/");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "failed"); setPhase("preview"); }
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

        {(phase === "input" || phase === "analyzing") && (
          <section className="rounded-card border border-line bg-card p-5">
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
              <button onClick={create} disabled={phase === "creating"} className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40">
                {phase === "creating" ? "Creating…" : "Create engagement →"}
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
