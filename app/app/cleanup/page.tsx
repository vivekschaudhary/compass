"use client";

import { useEffect, useState } from "react";

// Hidden test-teardown page (not linked in nav) — list every engagement and delete the junk ones.
// Deleting cascades all engagement-scoped data (see /api/engagement). Guarded by a typed confirm.
type Eng = { id: string; name: string; client: string | null; updated_at: string };

export default function Cleanup() {
  const [engagements, setEngagements] = useState<Eng[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    const j = await fetch("/api/engagement").then((r) => r.json()).catch(() => ({ ok: false }));
    setEngagements(j.ok ? j.engagements : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function del(e: Eng) {
    if (!window.confirm(`Delete engagement "${e.name}" (${e.id}) and ALL its data? This can't be undone.`)) return;
    setBusy(e.id); setMsg("");
    try {
      const j = await fetch(`/api/engagement?id=${encodeURIComponent(e.id)}`, { method: "DELETE" }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error || "delete failed");
      // if we just deleted the active engagement, drop the cookie so the app doesn't point at a ghost
      if (typeof document !== "undefined" && document.cookie.includes(`compass_eng=${e.id}`)) {
        document.cookie = "compass_eng=; path=/; max-age=0";
      }
      setMsg(`Deleted ${e.id}.`);
      await load();
    } catch (err) { setMsg(err instanceof Error ? err.message : "delete failed"); }
    setBusy("");
  }

  return (
    <div className="min-h-screen bg-shell">
      <header className="flex items-center justify-between border-b border-line bg-card px-6 py-4">
        <div className="leading-tight">
          <div className="text-[14.5px] font-semibold text-ink">Cleanup — engagements</div>
          <div className="text-[11px] text-faint">Hidden teardown page · deleting removes the engagement and all its data</div>
        </div>
        <a href="/" className="text-[13px] font-medium text-muted hover:text-ink">← Dashboard</a>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-8">
        {msg && <div className="mb-4 rounded-tile border border-line bg-card px-4 py-2.5 text-[12.5px] text-body">{msg}</div>}

        <section className="rounded-card border border-line bg-card">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h1 className="text-[15px] font-semibold text-ink">All engagements</h1>
            <button onClick={load} className="text-[12.5px] font-medium text-muted hover:text-ink">Refresh</button>
          </div>

          {loading ? (
            <p className="px-5 py-8 text-center text-[12.5px] text-muted">Loading…</p>
          ) : engagements.length === 0 ? (
            <p className="px-5 py-8 text-center text-[12.5px] text-muted">No engagements.</p>
          ) : (
            <ul className="flex flex-col">
              {engagements.map((e) => (
                <li key={e.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-ink">{e.name}</div>
                    <div className="mono truncate text-[11.5px] text-faint">{e.id}{e.client ? ` · ${e.client}` : ""}</div>
                  </div>
                  <button
                    onClick={() => del(e)}
                    disabled={busy === e.id}
                    className="shrink-0 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-1.5 text-[12.5px] font-semibold text-bad hover:bg-bad-weak disabled:opacity-40"
                  >
                    {busy === e.id ? "Deleting…" : "Delete"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-3 text-center text-[11.5px] text-faint">Tip: bookmark <span className="mono">/cleanup</span> — it isn&apos;t linked from the app.</p>
      </div>
    </div>
  );
}
