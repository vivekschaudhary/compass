"use client";

import { useState } from "react";
import { ProgramModel } from "@/app/lib/data";
import { StoryTasks } from "./StoryTasks";

// The durable home for a story's playbook — tracked tasks (promoted from AI deliverables) + the
// acceptance-criteria checklist. Pick a story, work its items to done, any time (not just post-run).
export function Playbook({ storyList }: { storyList: ProgramModel["storyList"] }) {
  const [story, setStory] = useState(storyList[0]?.id ?? "");
  const [refreshKey, setRefreshKey] = useState(0);
  const [seeding, setSeeding] = useState(false);

  async function seedAc() {
    if (!story) return;
    setSeeding(true);
    try {
      await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "seed-ac", storyId: story }) });
      setRefreshKey((k) => k + 1);
    } finally { setSeeding(false); }
  }

  return (
    <section className="rounded-card border border-line bg-card rise">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-semibold text-ink">Playbook</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">A story&apos;s tracked tasks + acceptance checklist — drafted by the AI, finished by you, worked to done.</p>
      </div>
      <div className="p-5">
        {storyList.length === 0 ? (
          <p className="rounded-tile border border-dashed border-line bg-shell/40 px-4 py-8 text-center text-[12.5px] text-muted">No stories yet — create an epic, then run a workflow to draft a playbook.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block min-w-[240px] flex-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Story</span>
                <select value={story} onChange={(e) => setStory(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
                  {storyList.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.title}{s.role ? ` · ${s.role}` : ""}</option>)}
                </select>
              </label>
              <button onClick={seedAc} disabled={!story || seeding} className="rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] font-medium text-body hover:bg-shell disabled:opacity-40">
                {seeding ? "Generating…" : "Generate AC checklist"}
              </button>
            </div>
            {story && <StoryTasks storyId={story} refreshKey={refreshKey} />}
            <p className="mt-3 text-[12px] text-muted">No items yet? Run a workflow (research, design spec…) to draft the task playbook, or generate the acceptance checklist above.</p>
          </>
        )}
      </div>
    </section>
  );
}
