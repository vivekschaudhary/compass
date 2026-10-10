"use client";

// The one way client code moves to another route.
//
// A bare `router.push` gives the person nothing until the next page's server render finishes —
// the old screen sits there looking dead. Wrapping it in a transition makes `pending` true for the
// whole navigation, and `key` names WHICH control started it so only that one shows the spinner.

import { useCallback, useEffect, useState, useTransition } from "react";
import { progressStore } from "./progress-store";
import { useRouter } from "next/navigation";

export function useNavigate() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => (isPending ? progressStore.begin() : undefined), [isPending]);

  const go = useCallback(
    (href: string, opts: { replace?: boolean; scroll?: boolean; key?: string } = {}) => {
      setKey(opts.key ?? href);
      startTransition(() => {
        const o = opts.scroll === undefined ? undefined : { scroll: opts.scroll };
        if (opts.replace) router.replace(href, o);
        else router.push(href, o);
      });
    },
    [router],
  );

  return {
    go,
    /** True while ANY navigation started here is in flight. */
    pending: isPending,
    /** The `key` of the control that started the in-flight navigation, else null. */
    pendingKey: isPending ? key : null,
  };
}
