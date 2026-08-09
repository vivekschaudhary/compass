"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
type FileEntry = { path: string; tier: Tier; updatedAt?: string; updatedBy?: string; drifted?: boolean };
type Change = { kind: string; severity: "danger" | "info"; detail: string };

type Validation =
  | { kind: "workflow"; ok: boolean; has_dispatch_graph: boolean; hitl_count: number; agents: string[];
      steps: { n: number; title: string; hitl: boolean; agent: string | null; task: string | null }[]; warnings: string[] }
  | { kind: "agent"; ok: boolean; preferred_hosts: string[]; executor_tools: string[]; model_tier: string | null; warnings: string[] }
  | { kind: "table"; ok: boolean; rows: Record<string, string>[]; warnings: string[] };

type Drift = { drifted: boolean; comparable: boolean; baseContent: string | null; currentBaseline: string };

type Loaded = {
  path: string; content: string; tier: Tier | null; updatedAt: string | null; updatedBy: string | null;
  below: { content: string; tier: Tier } | null; shipped: string | null;
  kind: string | null; validation: Validation | null; advisoryAuth: boolean; drift: Drift;
};

const TIER_LABEL: Record<Tier, string> = {
  engagement: "Overridden for this engagement",
  org: "Your organisation's default",
  framework: "Compass default",
};

// Plain English for each category. The directory names are the framework's vocabulary, not the
// reader's — a delivery manager opening this has no reason to know what "stacks" holds.
const GROUP_META: Record<string, { label: string; blurb: string }> = {
  templates: { label: "Templates", blurb: "Kickoff backlog, doc structure, artifact starting points" },
  workflows: { label: "Workflows", blurb: "The step-by-step sequences Compass runs" },
  agents: { label: "Agents", blurb: "What each role does, and which model runs it" },
  stacks: { label: "Tech stacks", blurb: "Build and test commands per technology" },
  framework: { label: "Framework", blurb: "The principles agents are held to" },
  root: { label: "Configuration", blurb: "Delivery policy, approvals, connectors" },
};

/** Ordered by how often someone actually edits them — everyday first, reference last. */
const GROUP_ORDER = ["templates", "workflows", "agents", "root", "stacks", "framework"];

export function SpecEditor({ scope, engagementId, role: roleProp }: {
  scope: "org" | "engagement"; engagementId?: string; role?: string;
}) {
  // Read the role from the URL rather than trusting a prop threaded through the server.
  // `?role=` is where the header's picker writes, and it is the ONLY place that is reliably
  // current: the sidebar's Settings link and the settings page's own canonicalizing redirect both
  // used to drop it, so a prop-only version silently arrived empty and every save was refused for
  // want of a capability the user actually had.
  const search = useSearchParams();
  const role = search.get("role") ?? roleProp ?? "";
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
  // Promotion has its own confirmation: it changes the firm's default, not this engagement's copy,
  // so it must not share a flag with the save gate and accidentally apply the wrong action.
  const [promoting, setPromoting] = useState(false);
  const [filter, setFilter] = useState("");
  // Start with everything collapsed. Templates opens by default because it holds the two files
  // anyone actually came here to change — the kickoff backlog and the doc tree.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["templates"]));
  const toggleGroup = (dir: string) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(dir)) next.delete(dir); else next.add(dir);
    return next;
  });

  const engParam = scope === "engagement" && engagementId ? `&engagementId=${encodeURIComponent(engagementId)}` : "";

  useEffect(() => {
    fetch(`/api/spec?${engParam.slice(1)}`).then((r) => r.json()).then((j) => {
      if (j.ok) { setFiles(j.files); setAdvisory(Boolean(j.advisoryAuth)); }
    });
  }, [engParam]);

  const open = useCallback(async (p: string) => {
    setBusy("load"); setMsg(null); setChanges([]); setConfirming(false); setPromoting(false);
    // Keep the open file's category expanded — otherwise clearing the filter collapses the group
    // and the file you are editing vanishes from the list you are editing it from.
    setOpenGroups((prev) => new Set(prev).add(p.includes("/") ? p.split("/")[0] : "root"));
    const r = await fetch(`/api/spec?path=${encodeURIComponent(p)}${engParam}`);
    const j = (await r.json()) as Loaded & { ok: boolean };
    setBusy("");
    if (!j.ok) { setMsg({ tone: "bad", text: "Could not open that file." }); return; }
    setPath(p); setLoaded(j); setDraft(j.content); setValidation(j.validation);
  }, [engParam]);

  // EXPLICIT, never automatic. This used to run on blur, which meant clicking Save re-rendered the
  // panel above the button and the click was lost between mousedown and mouseup. It is also a
  // Python process per call, which is the wrong cost to pay for leaving a text box.
  //
  // Saving validates server-side regardless, so nothing depends on this having been run — it is a
  // "show me what this parses as before I commit" affordance.
  async function check() {
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
    // Reload FIRST, then report. `open` clears the message on its way in, so setting it before
    // this wiped the only confirmation the user gets — the save worked and looked like it hadn't.
    await open(path);
    setMsg({ tone: "ok", text: "Saved. This is what runs now." });
    setChanges(j.changes ?? []);
  }

  /** "Keep mine" — re-anchor to the new baseline without touching content. */
  async function acknowledge() {
    setBusy("save"); setMsg(null);
    const r = await fetch("/api/spec", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acknowledge", scope, engagementId, path, role }),
    });
    const j = await r.json();
    setBusy("");
    if (!j.ok) { setMsg({ tone: "bad", text: j.error ?? "Could not update." }); return; }
    await open(path);
    setMsg({ tone: "ok", text: "Kept your version. It no longer shows as behind." });
  }

  async function promote(confirm = false) {
    setBusy("save"); setMsg(null);
    const r = await fetch("/api/spec", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "promote", scope, engagementId, path, role, confirmStructuralChange: confirm }),
    });
    const j = await r.json();
    setBusy("");
    if (j.needsConfirmation) { setChanges(j.changes ?? []); setPromoting(true); return; }
    setPromoting(false);
    if (!j.ok) { setMsg({ tone: "bad", text: j.error ?? "Could not promote." }); return; }
    await open(path);
    setMsg({ tone: "ok", text: "This is now your organisation default. The engagement inherits it." });
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
    await open(path);                                   // same ordering as save, same reason
    setMsg({ tone: "ok", text: "Reverted — this file follows the default again." });
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
    const q = filter.trim().toLowerCase();
    const g = new Map<string, FileEntry[]>();
    for (const f of files) {
      if (q && !f.path.toLowerCase().includes(q)) continue;
      const dir = f.path.includes("/") ? f.path.split("/")[0] : "root";
      g.set(dir, [...(g.get(dir) ?? []), f]);
    }
    // Ordered by how often a delivery manager actually touches them, not alphabetically — the
    // kickoff backlog and doc structure are the everyday edits; canon is a once-a-year read.
    return [...g.entries()].sort((a, b) => (GROUP_ORDER.indexOf(a[0]) + 1 || 99) - (GROUP_ORDER.indexOf(b[0]) + 1 || 99));
  }, [files, filter]);

  return (
    <div className="rounded-card border border-line bg-card" data-testid={`spec-editor-${scope}`}>
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

      <div className="grid grid-cols-[248px_1fr] gap-0">
        {/* ── file browser ─────────────────────────────────────────────
            Eighty files listed flat is a wall, and most of them are ones you will never touch.
            Categories collapse, carry a plain-English blurb (nobody arrives knowing what "stacks"
            means), and show how many files inside are already changed — so "where have we diverged
            from the default?" is answerable at a glance rather than by opening things. */}
        <nav className="max-h-[560px] overflow-y-auto border-r border-line">
          <div className="sticky top-0 z-10 border-b border-line bg-card p-2">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a file…" data-testid="spec-filter"
              className="w-full rounded-lg border border-line bg-shell/40 px-2.5 py-1.5 text-[12.5px] text-body outline-none focus:border-brand" />
          </div>

          <div className="py-1">
            {grouped.map(([dir, entries]) => {
              const meta = GROUP_META[dir] ?? { label: dir, blurb: "" };
              const changed = entries.filter((f) => f.tier !== "framework").length;
              // Filtering implies intent to see matches, so it overrides collapse — otherwise you
              // type a name and the thing you searched for stays hidden behind a closed group.
              const expanded = filter.trim() ? true : openGroups.has(dir);
              return (
                <div key={dir} className="mb-0.5">
                  <button onClick={() => toggleGroup(dir)}
                    aria-expanded={expanded} data-testid={`spec-group-${dir}`}
                    className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left hover:bg-shell">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      strokeLinecap="round" strokeLinejoin="round"
                      className={`shrink-0 text-faint transition-transform ${expanded ? "rotate-90" : ""}`}>
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold text-ink">{meta.label}</span>
                      {meta.blurb && <span className="block text-[10.5px] leading-tight text-faint">{meta.blurb}</span>}
                    </span>
                    {changed > 0 && (
                      <span title={`${changed} changed from the default`}
                        className="shrink-0 rounded-pill bg-brand-weak px-1.5 py-0.5 text-[10px] font-semibold text-brand-ink">{changed}</span>
                    )}
                    <span className="shrink-0 text-[10.5px] text-faint">{entries.length}</span>
                  </button>

                  {expanded && entries.map((f) => {
                    const name = f.path.split("/").pop();
                    const overridden = f.tier !== "framework";
                    return (
                      <button key={f.path} onClick={() => open(f.path)} data-testid={`spec-file-${f.path}`}
                        className={`flex w-full items-center gap-1.5 py-1.5 pl-7 pr-3 text-left text-[12.5px] hover:bg-shell ${f.path === path ? "bg-shell font-medium text-ink" : "text-body"}`}>
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                        {f.drifted && (
                          <span title="The default changed after this was edited"
                            className="size-1.5 shrink-0 rounded-full bg-warn" />
                        )}
                        {overridden && (
                          <span title={TIER_LABEL[f.tier]}
                            className={`size-1.5 shrink-0 rounded-full ${f.tier === "engagement" ? "bg-brand" : "bg-good"}`} />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {grouped.length === 0 && (
              <p className="px-3 py-4 text-[12px] text-faint">Nothing matches “{filter}”.</p>
            )}
          </div>
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

              {loaded.drift.drifted && (
                <DriftBanner
                  drift={loaded.drift}
                  belowLabel={loaded.below?.tier === "org" ? "organisation default" : "Compass default"}
                  busy={busy === "save" || busy === "revert"}
                  onKeep={acknowledge}
                  onTake={revert}
                />
              )}

              <textarea
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setMsg(null); setConfirming(false); }}
                spellCheck={false}
                data-testid="spec-content"
                className="mono mt-3 h-[380px] w-full resize-y rounded-tile border border-line bg-shell/40 px-3 py-2.5 text-[12px] leading-relaxed text-body outline-none focus:border-brand"
              />

              {/* ACTIONS SIT DIRECTLY UNDER THE TEXTAREA, above everything that can change height.
                  They used to be at the bottom, under the validator panel — which re-rendered on
                  blur, so clicking Save moved the button out from under the pointer between
                  mousedown and mouseup and the click was simply lost. Nothing below this row can
                  push it now, which is the actual fix: `onMouseDown` would also have worked for a
                  mouse and silently broken Enter/Space, since keyboard activation fires click. */}
              <div className="mt-3 flex items-center justify-between">
                <div className="flex gap-2">
                  <button onClick={() => save()} disabled={!dirty || busy === "save" || confirming} data-testid="spec-save"
                    className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40">
                    {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
                  </button>
                  <button onClick={check} disabled={!dirty || busy === "validate"} data-testid="spec-check"
                    className="rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-body hover:bg-shell disabled:opacity-40">
                    {busy === "validate" ? "Checking…" : "Check"}
                  </button>
                  <button onClick={() => { setDraft(loaded.content); setChanges([]); setConfirming(false); setMsg(null); }}
                    disabled={!dirty}
                    className="rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-body hover:bg-shell disabled:opacity-40">
                    Discard
                  </button>
                </div>
                <div className="flex items-center gap-3">
                {scope === "engagement" && loaded.tier === "engagement" && (
                  // Only meaningful on an engagement's OWN override. The server checks the
                  // capability too — this just avoids offering an action that will be refused.
                  <button onClick={() => promote()} disabled={busy === "save" || dirty}
                    title={dirty ? "Save your changes first" : "Make this the default for every engagement"}
                    data-testid="spec-promote"
                    className="text-[12.5px] font-medium text-brand hover:underline disabled:opacity-40">
                    Promote to organisation default
                  </button>
                )}
                {loaded.tier !== "framework" && (
                  <button onClick={revert} disabled={busy === "revert"}
                    className="text-[12.5px] font-medium text-muted hover:text-bad">
                    {busy === "revert" ? "Reverting…" : `Revert to ${loaded.below?.tier === "org" ? "the organisation default" : "the Compass default"}`}
                  </button>
                )}
                </div>
              </div>

              {promoting && (
                <div className="mt-3 rounded-tile border border-bad-weak bg-bad-weak/40 px-4 py-3" data-testid="spec-promote-confirm">
                  <p className="text-[12.5px] font-medium text-bad">
                    Making this the organisation default removes something the current default has.
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {dangerous.map((c, i) => <li key={i} className="text-[12px] text-bad">· {c.detail}</li>)}
                  </ul>
                  <p className="mt-2 text-[12px] text-muted">This affects every engagement that has not overridden this file.</p>
                  <div className="mt-2.5 flex gap-2">
                    <button onClick={() => promote(true)} disabled={busy === "save"} data-testid="spec-promote-anyway"
                      className="rounded-lg bg-bad px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                      Promote anyway
                    </button>
                    <button onClick={() => setPromoting(false)}
                      className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium text-body hover:bg-shell">
                      Cancel
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

              <ValidatorPanel validation={validation} busy={busy === "validate"} stale={dirty} />

              {changes.length > 0 && <ChangeList changes={changes} />}

              {confirming && (
                <div className="mt-3 rounded-tile border border-bad-weak bg-bad-weak/40 px-4 py-3" data-testid="spec-confirm">
                  <p className="text-[12.5px] font-medium text-bad">This removes something the current version has.</p>
                  <ul className="mt-1.5 space-y-0.5">
                    {dangerous.map((c, i) => <li key={i} className="text-[12px] text-bad">· {c.detail}</li>)}
                  </ul>
                  <p className="mt-2 text-[12px] text-muted">
                    That may be exactly what you want. It will be recorded against your name.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <button onClick={() => save(true)} disabled={busy === "save"} data-testid="spec-save-anyway"
                      className="rounded-lg bg-bad px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                      {busy === "save" ? "Saving…" : "Save anyway"}
                    </button>
                    <button onClick={() => setConfirming(false)} data-testid="spec-keep-editing"
                      className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium text-body hover:bg-shell">
                      Keep editing
                    </button>
                  </div>
                </div>
              )}

              {diff && stat.changed && <DiffPanel lines={diff} baseTier={loaded.below?.tier ?? "framework"} />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * "The default moved under you."
 *
 * The useful view is OLD default → NEW default, not your version vs the new one: for a 400-line
 * workflow the latter is a wall of differences, most of them your own edits, and the question you
 * actually have is whether the framework's change touched the part you changed.
 *
 * When the override predates `base_content` (021) we cannot produce that comparison, so the banner
 * says so rather than showing a diff that would silently mean something else.
 */
function DriftBanner({ drift, belowLabel, busy, onKeep, onTake }: {
  drift: Drift; belowLabel: string; busy: boolean; onKeep: () => void; onTake: () => void;
}) {
  const diff = drift.comparable && drift.baseContent !== null
    ? diffLines(drift.baseContent, drift.currentBaseline) : null;
  const stat = diffStat(diff);

  return (
    <div className="mt-3 rounded-tile border border-warn-weak bg-warn-weak/40 px-4 py-3" data-testid="spec-drift">
      <p className="text-[12.5px] font-medium text-warn">
        The {belowLabel} changed after you edited this file.
      </p>
      <p className="mt-0.5 text-[12px] text-muted">
        Your version is still what runs. It has not picked up{" "}
        {stat.changed ? `the ${stat.added} added and ${stat.removed} removed line(s) below` : "that change"}.
      </p>

      {diff ? (
        <details className="mt-2 rounded-tile border border-line bg-card/60">
          <summary className="cursor-pointer px-3 py-1.5 text-[12px] font-medium text-body">
            What changed in the {belowLabel}
          </summary>
          <pre className="mono max-h-56 overflow-auto border-t border-line px-2 py-2 text-[11.5px] leading-relaxed">
            {collapseUnchanged(diff, 3).map((r, i) =>
              r.type === "gap"
                ? <div key={i} className="px-1.5 py-0.5 text-faint">⋯ {r.count} unchanged line{r.count === 1 ? "" : "s"}</div>
                : <div key={i} className={
                    r.type === "add" ? "bg-good-weak/50 px-1.5 text-good"
                    : r.type === "remove" ? "bg-bad-weak/40 px-1.5 text-bad" : "px-1.5 text-muted"}>
                    <span className="select-none opacity-60">{r.type === "add" ? "+" : r.type === "remove" ? "−" : " "} </span>
                    {r.text || " "}
                  </div>
            )}
          </pre>
        </details>
      ) : (
        <p className="mt-2 text-[12px] text-faint">
          The previous version of the {belowLabel} wasn&apos;t recorded, so there is nothing to compare against.
        </p>
      )}

      <div className="mt-2.5 flex gap-2">
        <button onClick={onKeep} disabled={busy} data-testid="spec-drift-keep"
          className="rounded-lg border border-line bg-card px-3 py-1.5 text-[12.5px] font-medium text-body hover:bg-shell disabled:opacity-50">
          Keep mine
        </button>
        <button onClick={onTake} disabled={busy} data-testid="spec-drift-take"
          className="rounded-lg border border-line bg-card px-3 py-1.5 text-[12.5px] font-medium text-body hover:bg-shell disabled:opacity-50">
          Take the new {belowLabel}
        </button>
      </div>
    </div>
  );
}

/** What the PARSER extracted — the thing that makes a silent break visible.
 *
 *  `stale` matters: with checking now explicit, the panel can describe the SAVED version while the
 *  box holds unsaved edits. Showing that without saying so would be worse than showing nothing —
 *  it would look like confirmation of a change nobody has parsed yet. */
function ValidatorPanel({ validation, busy, stale }: { validation: Validation | null; busy: boolean; stale?: boolean }) {
  if (busy) return <p className="mt-3 text-[12px] text-muted">Checking…</p>;
  if (!validation) {
    return <p className="mt-3 text-[12px] text-faint">
      This file is prose — there is no structure to check mechanically, so it saves as written.
    </p>;
  }

  return (
    <div className={`mt-3 rounded-tile border border-line bg-shell/30 px-3.5 py-3 ${stale ? "opacity-60" : ""}`} data-testid="spec-validation">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          {stale ? "Compass reads the SAVED version as" : "Compass reads this as"}
        </span>
        {stale && <span className="rounded-pill bg-warn-weak px-2 py-0.5 text-[11px] font-medium text-warn">unsaved edits — press Check</span>}
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
