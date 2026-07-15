"use client";

import { useEffect, useState, useCallback } from "react";
import { TaskItem } from "@/app/lib/data";

// Renders a story's playbook — promoted tasks (kind='task') + the AC checklist (kind='ac') — with
// checkable items + progress. Self-contained: fetches its own tasks so it can be dropped anywhere.
function Row({ t, onToggle }: { t: TaskItem; onToggle: (t: TaskItem) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-shell/50">
      <input type="checkbox" checked={t.done} onChange={() => onToggle(t)} className="size-3.5" />
      <span className={`min-w-0 flex-1 truncate ${t.done ? "text-faint line-through" : "text-body"}`}>{t.title}</span>
      {t.role && <span className="shrink-0 rounded-pill bg-shell px-1.5 py-0.5 text-[10px] font-medium text-muted">{t.role}</span>}
    </label>
  );
}

function Section({ label, items, onToggle }: { label: string; items: TaskItem[]; onToggle: (t: TaskItem) => void }) {
  if (!items.length) return null;
  const done = items.filter((t) => t.done).length;
  return (
    <div>
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-[10.5px] font-medium uppercase tracking-wide text-faint">{label}</span>
        <span className="tnum text-[10.5px] text-faint">{done}/{items.length}</span>
      </div>
      <div className="flex flex-col">{items.map((t) => <Row key={t.id} t={t} onToggle={onToggle} />)}</div>
    </div>
  );
}

export function StoryTasks({ storyId, refreshKey = 0 }: { storyId: string; refreshKey?: number }) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?storyId=${encodeURIComponent(storyId)}`);
      const j = await res.json();
      setTasks(j.ok ? j.tasks : []);
    } finally { setLoading(false); }
  }, [storyId]);

  useEffect(() => { if (storyId) load(); }, [storyId, load, refreshKey]);

  async function toggle(t: TaskItem) {
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x))); // optimistic
    await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle", taskId: t.id, done: !t.done }) });
  }

  const playbook = tasks.filter((t) => t.kind === "task");
  const ac = tasks.filter((t) => t.kind === "ac");
  if (loading && !tasks.length) return <p className="px-2 py-2 text-[12px] text-muted">Loading tasks…</p>;
  if (!tasks.length) return null;

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-tile border border-line bg-shell/30 p-3">
      <Section label="Playbook" items={playbook} onToggle={toggle} />
      <Section label="Acceptance criteria" items={ac} onToggle={toggle} />
    </div>
  );
}
