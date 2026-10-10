"use client";

// Run a server action, then show its result — without the busy flag lying.
//
// The old shape was `setBusy(true); await action(); router.refresh(); setBusy(false)`. The refresh
// is not awaited, so the flag cleared while the new data was still on its way and the screen read
// as "done, nothing changed". Here the refresh/navigation happens inside the same transition, so
// `pending` stays true until the new render has landed.

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";

export type ActionResult = { refresh?: boolean; href?: string } | void;

export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (fn: () => Promise<ActionResult>) => {
      startTransition(async () => {
        const r = await fn();
        if (r && r.href) router.push(r.href);
        else if (r && r.refresh) router.refresh();
      });
    },
    [router],
  );

  return { run, pending };
}
