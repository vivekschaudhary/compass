"use client";

// Refresh this page when the row it's showing changes — including from a run this tab never
// started. The sweep (see `run_retry_and_sweep.sql`) can pick a task back up minutes after the tab
// that started it closed; without this, the only way to see that is to reload by hand.
//
// Renders nothing. `Composer` keeps its own `router.refresh()` after the request it
// made themselves — this is the complementary case: a change made by a DIFFERENT invocation of
// `runAgent`, one this tab never called and has no promise to await.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabase-browser";

export function RealtimeRefresh({ taskId }: { taskId: string }) {
  const router = useRouter();

  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;

    const channel = sb
      .channel(`task-${taskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_task", filter: `id=eq.${taskId}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "turn", filter: `task_id=eq.${taskId}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "question", filter: `task_id=eq.${taskId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [taskId, router]);

  return null;
}
