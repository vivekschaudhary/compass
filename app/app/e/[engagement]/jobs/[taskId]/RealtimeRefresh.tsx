"use client";

// Refresh this page when the row it's showing changes — including from a run this tab never
// started. The sweep (see `run_retry_and_sweep.sql`) can pick a task back up minutes after the tab
// that started it closed; without this, the only way to see that is to reload by hand.
//
// Renders nothing. `Composer` keeps its own `router.refresh()` after the request it makes itself —
// but that request now resolves in milliseconds (the run is detached, see `/api/agent/run`'s own
// header), so it is no longer a backstop for anything past the first instant. From the moment the
// run is accepted, THIS is the only thing standing between a tab and a run that finishes silently
// underneath it.
//
// TWO layers, not one, because a plain `.subscribe()` with no status handling is a channel that can
// die without telling anyone: a network blip, a backgrounded tab, a long-lived connection just
// timing out. Found live — a task finished (`state: hitl`, `executor: null` in the database) while
// its own open tab sat showing "working" for minutes past that, because nothing here noticed the
// channel had gone quiet. `router.refresh()` was firing from state changes when the channel was
// healthy; it never fired again once it wasn't, and nothing recreated it.
//
//   1. RECONNECT — a status callback on `.subscribe()`. `SUBSCRIBED` resets the retry count; anything
//      else (`CLOSED`, `TIMED_OUT`, `CHANNEL_ERROR`) tears the channel down and opens a fresh one,
//      backed off (1s, 2s, 4s… capped at 30s) so a real outage does not spin.
//   2. POLL — belt and suspenders for a channel that fails silently in some way the SDK never
//      reports as one of those statuses at all. Active only while `pollWhileRunning` is true (the
//      page's own `running` — heartbeat-derived, see `heartbeat-config.ts`), so an idle or closed
//      task costs nothing; the moment a refresh lands with a state that is no longer running, the
//      prop goes false on the next render and the poll stops itself.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabase-browser";

const POLL_MS = 45_000;
const MAX_BACKOFF_MS = 30_000;

/** 1s, 2s, 4s, 8s… capped — pulled out so the cap itself is checked by a real test, not just read
 *  by eye. The one easy way to get this wrong is forgetting the cap and reconnecting slower and
 *  slower forever on a real outage. */
export function backoffMs(retries: number): number {
  return Math.min(MAX_BACKOFF_MS, 1000 * 2 ** retries);
}

export function RealtimeRefresh({
  taskId, pollWhileRunning = false,
}: {
  taskId: string;
  /** True while this task's own claim reads as live — see `page.tsx`'s `running`. */
  pollWhileRunning?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;

    let cancelled = false;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Reassigned on every (re)subscribe — the effect's own cleanup always removes whichever one is
    // current, not the one captured at mount.
    let channel: ReturnType<typeof sb.channel> | null = null;

    function open() {
      if (cancelled) return;
      channel = sb!
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
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            retries = 0;
            return;
          }
          if (status === "CLOSED" || status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
            const delay = backoffMs(retries);
            retries++;
            const dead = channel;
            timer = setTimeout(() => {
              if (dead) sb!.removeChannel(dead);
              open();
            }, delay);
          }
        });
    }

    open();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) sb!.removeChannel(channel);
    };
  }, [taskId, router]);

  useEffect(() => {
    if (!pollWhileRunning) return;
    const t = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [pollWhileRunning, router]);

  return null;
}
