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
import { useOptimisticTurns } from "./OptimisticTurns";
import { backoffMs } from "./realtime-backoff";

const POLL_MS = 45_000;

export function RealtimeRefresh({
  taskId, pollWhileRunning = false,
}: {
  taskId: string;
  /** True while this task's own claim reads as live — see `page.tsx`'s `running`. */
  pollWhileRunning?: boolean;
}) {
  const router = useRouter();
  const { refreshTurns } = useOptimisticTurns();

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
          // A state change (idle→running→hitl→closed) genuinely changes which sections of the page
          // are mounted — ApprovePanel, NestedRunPanel, Composer's own controls — so this is one of
          // the two things still worth a full `router.refresh()`. `refreshTurns` rides along too:
          // some state transitions (the model declining, filing failing) also add a turn in the
          // same beat, and `Conversation` no longer sees a new turn from `router.refresh()` alone —
          // see `OptimisticTurns.tsx`'s own header.
          () => { router.refresh(); void refreshTurns(); },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "turn", filter: `task_id=eq.${taskId}` },
          // Never changes what's MOUNTED — only what the conversation shows — so this is exactly
          // the case `refreshTurns` exists for: no draft, gates, document tree or context strip
          // refetch just to bring in one more message.
          () => void refreshTurns(),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "question", filter: `task_id=eq.${taskId}` },
          // A NEW question changes what's mounted too (the qcard appears) — unlike removing an
          // already-answered one, which `Composer` already handles locally without any refresh.
          () => router.refresh(),
        )
        // Sent by the server the moment a run returns (see notify-run-ended.ts) — the signal that
        // does not depend on the database's change feed or the page's own polling at all. A run's
        // end changes what's mounted (ApprovePanel, NestedRunPanel) the same way a state row change
        // does, so it gets the same full refresh.
        .on("broadcast", { event: "run-ended" }, () => { router.refresh(); void refreshTurns(); })
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
  }, [taskId, router, refreshTurns]);

  useEffect(() => {
    if (!pollWhileRunning) return;
    // Both — the state might have moved on (router.refresh()) and/or the agent's reply might have
    // landed (refreshTurns()); this fallback exists for a channel failure the SDK never reports, so
    // it cannot assume which of the two actually happened.
    const t = setInterval(() => { router.refresh(); void refreshTurns(); }, POLL_MS);
    return () => clearInterval(t);
  }, [pollWhileRunning, router, refreshTurns]);

  return null;
}
