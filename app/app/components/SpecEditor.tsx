"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { diffLines, diffStat, collapseUnchanged, type DiffLine } from "@/app/lib/diff";

// Editing the framework's markdown without repo access.
//
// One component, two mounts: /admin edits the ORG DEFAULT (how the firm works), Settings edits an
// ENGAGEMENT OVERRIDE (how this client differs). Same editor, same validator, same history — only
// the scope differs, so the two cannot drift into behaving differently.
//
// The validator panel is the reason this is safe to ship. These files are scraped by regex and the
// failure mode is silent: a damaged step heading merges two steps, turns a dispatch into a human
// gate, and drops an agent — while every total still looks right. So the editor always shows what
// the PARSER extracted, and a save that loses a step, a gate, an agent or a row has to be
// confirmed.

type Tier = "engagement" | "org" | "framework";
type FileEntry = { path: string; tier: Tier; updatedAt?: string; updatedBy?: string };
type Change = { kind: string; severity: "danger" | "info"; detail: string };

type Validation =
  | { kind: "workflow"; ok: boolean; has_dispatch_graph: boolean; hitl_count: number; agents: string[];
      steps: { n: number; title: string; hitl: boolean; agent: string | null; task: string | null }[]; warnings: string[] }
  | { kind: "agent"; ok: boolean; preferred_hosts: string[]; executor_tools: string[]; model_tier: string | null; warnings: string[] }
  | { kind: "table"; ok: boolean; rows: Record<string, string>[]; warnings: string[] };

type Loaded = {
  path: string; content: string; tier: Tier | null; updatedAt: string | null; updatedBy: string | null;
  below: { content: string; tier: Tier } | null; shipped: string | null;
  kind: string | null; validation: Validation | null; advisoryAuth: boolean;
};

const TIER_LABEL: Record<Tier, string> = {
  engagement: "Overridden for this engagement",
  org: "Your organisation's default",
  framework: "Compass default",
};

export function SpecEditor({ scope, engagementId, role }: {
  scope: "org" | "engagement"; engagementId?: string; role: string;
}) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [advisory, setAdvisory] = useState(false);
  const [path, setPath] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState("");
  const [validation, setValidation] = useState<Validation | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [busy, setBusy] = useState<"" | "load" | "validate" | "save" | "revert">("");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad" | "warn"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const engParam = scope === "engagement" && engagementId ? `&engagementId=${encodeURIComponent(engagementId)}` : "";

  useEffect(() => {
    fetch(`/api/spec?${engParam.slice(1)}`).then((r) => r.json()).then((j) => {
      if (j.ok) { setFiles(j.files); setAdvisory(Boolean(j.advisoryAuth)); }
    });
  }, [engParam]);

  const open = useCallback(async (p: string) => {
    setBusy("load"); setMsg(null); setChanges([]); setConfirming(false);
    const r = await fetch(`/api/spec?path=${encodeURIComponent(p)}${engParam}`);
    const j = (await r.json()) as Loaded & { ok: boolean };
    setBusy("");
    if (!j.ok) { setMsg({ tone: "bad", text: "Could not open that file." }); return; }
    setPath(p); setLoaded(j); setDraft(j.content); setValidation(j.validation);
  }, [engParam]);

  // On blur, never per keystroke: each call spawns a Python process, and a process per character
  // is the wrong cost for a text box.
  async function validate() {
    if (!loaded || draft === loaded.content) return;
    setBusy("validate");
    const r = await fetch("/api/spec", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "validate", scope, engagementId, path, content: draft }),
    });
    const j = await r.json();
    setBusy("");
    if (j.ok) { setValidation(j.validation); setChanges(j.changes ?? []); }
  }

  async function save(confirm = false) {
    setBusy("save"); setMsg(null);
    const r = await fetch("/api/spec", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", scope, engagementId, path, content: draft, role,
                             confirmStructuralChange: confirm }),
    });
    const j = await r.json();
    setBusy("");
    if (j.needsConfirmation) { setChanges(j.changes ?? []); setConfirming(true); return; }
    setConfirming(false);
    if (!j.ok) {
      setValidation(j.validation ?? validation);
      setMsg({ tone: "bad", text: j.error ?? "Save failed." });
      return;
    }
    setMsg({ tone: "ok", text: "Saved. This is what runs now." });
    setChanges(j.changes ?? []);
    await open(path);
  }

  async function revert() {
    setBusy("revert"); setMsg(null);
    const r = await fetch("/api/spec", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revert", scope, engagementId, path, role }),
    });
    const j = await r.json();
    setBusy("");
    if (!j.ok) { setMsg({ tone: "bad", text: j.error ?? "Revert failed." }); return; }
    setMsg({ tone: "ok", text: "Reverted — this file follows the default again." });
    await open(path);
  }

  const dirty = Boolean(loaded && draft !== loaded.content);
  const dangerous = changes.filter((c) => c.severity === "danger");

  // Against the tier BELOW, so an override reads as "what I changed", not "the whole file".
  const diff = useMemo(() => {
    if (!loaded) return null;
    const base = loaded.below?.content ?? loaded.shipped ?? "";
    return diffLines(base, draft);
  }, [loaded, draft]);
  const stat = diffStat(diff);

  const grouped = useMemo(() => {
    const g = new Map<string, FileEntry[]>();
    for (const f of files) {
      const dir = f.path.includes("/") ? f.path.split("/")[0] : "root";
      g.set(dir, [...(g.get(dir) ?? []), f]);
    }
    return [...g.entries()].sort();
  }, [files]);

  return (
    <div className="rounded-card border border-line bg-card">
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">
            {scope === "org" ? "Organisation defaults" : "This engagement's process"}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {scope === "org"
              ? "How your delivery runs by default. Every engagement inherits these unless it overrides them."
              : "Where this client differs from your organisation's default. Everything you don't change stays inherited."}
          </p>
        </div>
        {advisory && (
          // Say it plainly. A role picker that looks like access control is worse than none,
          // because someone eventually believes it. Disappears when real auth lands.
          <span className="shrink-0 rounded-pill bg-warn-weak px-2.5 py-1 text-[11.5px] font-medium text-warn">
            Demo mode · role selection is not sign-in
          </span>
        )}
      </header>

      <div className="grid grid-cols-[220px_1fr] gap-0">
        {/* ── file browser ─────────────────────────────────────────── */}
        <nav className="max-h-[560px] overflow-y-auto border-r border-line py-2">
          {grouped.map(([dir, entries]) => (
            <div key={dir} className="mb-2">
              <div className="px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-faint">{dir}</div>
              {entries.map((f) => {
                const name = f.path.split("/").pop();
                const overridden = f.tier !== "framework";
                return (
                  <button key={f.path} onClick={() => open(f.path)}
                    className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[12.5px] hover:bg-shell ${f.path === path ? "bg-shell font-medium text-ink" : "text-body"}`}>
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    {overridden && (
                      <span title={TIER_LABEL[f.tier]}
                        className={`size-1.5 shrink-0 rounded-full ${f.tier === "engagement" ? "bg-brand" : "bg-good"}`} />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* ── editor ───────────────────────────────────────────────── */}
        <section className="min-w-0 p-5">
          {!loaded && <p className="text-[12.5px] text-muted">Pick a file to see what it does and change it.</p>}

          {loaded && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono text-[12.5px] font-medium text-ink">{loaded.path}</span>
                <span className={`rounded-pill px-2 py-0.5 text-[11px] font-medium ${
                  loaded.tier === "framework" ? "bg-shell text-muted"
                  : loaded.tier === "org" ? "bg-good-weak text-good" : "bg-brand-weak text-brand-ink"}`}>
                  {loaded.tier ? TIER_LABEL[loaded.tier] : "—"}
                </span>
                {loaded.updatedBy && (
                  <span className="text-[11.5px] text-faint">
                    edited by {loaded.updatedBy}{loaded.updatedAt ? ` · ${new Date(loaded.updatedAt).toLocaleDateString()}` : ""}
                  </span>
                )}
                {stat.changed && <span className="text-[11.5px] text-muted">+{stat.added} −{stat.removed} vs default</span>}
              </div>

              <textarea
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setMsg(null); setConfirming(false); }}
                onBlur={validate}
                spellCheck={false}
                className="mono mt-3 h-[380px] w-full resize-y rounded-tile border border-line bg-shell/40 px-3 py-2.5 text-[12px] leading-relaxed text-body outline-none focus:border-brand"
              />

              <ValidatorPanel validation={validation} busy={busy === "validate"} />

              {changes.length > 0 && <ChangeList changes={changes} />}

              {confirming && (
                <div className="mt-3 rounded-tile border border-bad-weak bg-bad-weak/40 px-4 py-3">
                  <p className="text-[12.5px] font-medium text-bad">This removes something the current version has.</p>
                  <ul className="mt-1.5 space-y-0.5">
                    {dangerous.map((c, i) => <li key={i} className="text-[12px] text-bad">· {c.detail}</li>)}
                  </ul>
                  <p className="mt-2 text-[12px] text-muted">
                    That may be exactly what you want. It will be recorded against your name.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <button onClick={() => save(true)} disabled={busy === "save"}
                      className="rounded-lg bg-bad px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                      {busy === "save" ? "Saving…" : "Save anyway"}
                    </button>
                    <button onClick={() => setConfirming(false)}
                      className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium text-body hover:bg-shell">
                      Keep editing
                    </button>
                  </div>
                </div>
              )}

              {msg && (
                <p className={`mt-3 rounded-tile border px-3 py-2 text-[12.5px] ${
                  msg.tone === "ok" ? "border-good-line bg-good-weak/50 text-good"
                  : msg.tone === "warn" ? "border-warn-weak bg-warn-weak/50 text-warn"
                  : "border-bad-weak bg-bad-weak/50 text-bad"}`}>{msg.text}</p>
              )}

              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-2">
                  <button onClick={() => save()} disabled={!dirty || busy === "save" || confirming}
                    className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40">
                    {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
                  </button>
                  <button onClick={() => { setDraft(loaded.content); setChanges([]); setConfirming(false); setMsg(null); }}
                    disabled={!dirty}
                    className="rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-body hover:bg-shell disabled:opacity-40">
                    Discard
                  </button>
                </div>
                {loaded.tier !== "framework" && (
                  <button onClick={revert} disabled={busy === "revert"}
                    className="text-[12.5px] font-medium text-muted hover:text-bad">
                    {busy === "revert" ? "Reverting…" : `Revert to ${loaded.below?.tier === "org" ? "the organisation default" : "the Compass default"}`}
                  </button>
                )}
              </div>

              {diff && stat.changed && <DiffPanel lines={diff} baseTier={loaded.below?.tier ?? "framework"} />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** What the PARSER extracted — the thing that makes a silent break visible. */
function ValidatorPanel({ validation, busy }: { validation: Validation | null; busy: boolean }) {
  if (busy) return <p className="mt-3 text-[12px] text-muted">Checking…</p>;
  if (!validation) {
    return <p className="mt-3 text-[12px] text-faint">
      This file is prose — there is no structure to check mechanically, so it saves as written.
    </p>;
  }

  return (
    <div className="mt-3 rounded-tile border border-line bg-shell/30 px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Compass reads this as</span>
        {!validation.ok && <span className="rounded-pill bg-bad-weak px-2 py-0.5 text-[11px] font-medium text-bad">unusable</span>}
      </div>

      {validation.kind === "workflow" && (
        validation.steps.length ? (
          <ol className="mt-2 space-y-1">
            {validation.steps.map((s) => (
              <li key={s.n} className="flex items-baseline gap-2 text-[12.5px]">
                <span className="mono w-6 shrink-0 text-faint">{s.n}</span>
                {s.hitl
                  ? <span className="rounded-pill bg-warn-weak px-2 py-0.5 text-[11px] font-semibold text-warn">HUMAN APPROVAL</span>
                  : <span className="mono rounded-pill bg-brand-weak px-2 py-0.5 text-[11px] text-brand-ink">{s.agent ?? "—"}{s.task ? `.${s.task}` : ""}</span>}
                <span className="min-w-0 truncate text-muted">{s.title}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1.5 text-[12.5px] text-muted">
            {validation.has_dispatch_graph ? "No steps found." : "No agent sequence — a report-style workflow."}
          </p>
        )
      )}

      {validation.kind === "agent" && (
        <dl className="mt-2 grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[12.5px]">
          <dt className="text-faint">Runs on</dt><dd className="mono text-body">{validation.preferred_hosts.join(", ") || "—"}</dd>
          <dt className="text-faint">Tools</dt><dd className="mono text-body">{validation.executor_tools.join(", ") || "none"}</dd>
          <dt className="text-faint">Model tier</dt><dd className="mono text-body">{validation.model_tier ?? "default"}</dd>
        </dl>
      )}

      {validation.kind === "table" && (
        <p className="mt-1.5 text-[12.5px] text-muted">
          {validation.rows.length} row{validation.rows.length === 1 ? "" : "s"} —{" "}
          {validation.rows.map((r) => Object.values(r)[0]).filter(Boolean).join(" · ") || "none"}
        </p>
      )}

      {validation.warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-line pt-2">
          {validation.warnings.map((w, i) => <li key={i} className="text-[12px] text-warn">⚠ {w}</li>)}
        </ul>
      )}
    </div>
  );
}

function ChangeList({ changes }: { changes: Change[] }) {
  return (
    <ul className="mt-2 space-y-0.5">
      {changes.map((c, i) => (
        <li key={i} className={`text-[12px] ${c.severity === "danger" ? "text-bad" : "text-muted"}`}>
          {c.severity === "danger" ? "−" : "+"} {c.detail}
        </li>
      ))}
    </ul>
  );
}

function DiffPanel({ lines, baseTier }: { lines: DiffLine[]; baseTier: Tier }) {
  const rows = collapseUnchanged(lines, 3);
  return (
    <details className="mt-4 rounded-tile border border-line">
      <summary className="cursor-pointer px-3.5 py-2 text-[12.5px] font-medium text-body">
        What you changed vs {baseTier === "org" ? "the organisation default" : "the Compass default"}
      </summary>
      <pre className="mono max-h-72 overflow-auto border-t border-line px-2 py-2 text-[11.5px] leading-relaxed">
        {rows.map((r, i) =>
          r.type === "gap"
            ? <div key={i} className="px-1.5 py-0.5 text-faint">⋯ {r.count} unchanged line{r.count === 1 ? "" : "s"}</div>
            : <div key={i} className={
                r.type === "add" ? "bg-good-weak/50 px-1.5 text-good"
                : r.type === "remove" ? "bg-bad-weak/40 px-1.5 text-bad" : "px-1.5 text-muted"}>
                <span className="select-none opacity-60">{r.type === "add" ? "+" : r.type === "remove" ? "−" : " "} </span>
                {r.text || " "}
              </div>
        )}
      </pre>
    </details>
  );
}
