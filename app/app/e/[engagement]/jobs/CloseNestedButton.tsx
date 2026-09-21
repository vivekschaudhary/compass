"use client";

// Finish a row whose nested run has done the work.
//
// A nesting row has no draft and no reviewer — every row of its child run carried its own gate and
// its own approval — so `ApprovePanel` never renders on one, and until this existed there was no
// control anywhere in the app that could close it. `remeasureRun` retries the close on its own, but
// only when something re-measures; a criterion that turns true out in Confluence or Jira is nobody's
// event. This is the hand.
//
// The refusal is shown in full and on purpose. It names the Done criterion that is not met, which
// is the difference between "press it again" and "go and publish the page".

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../_ui/primitives";
import { closeNestedAction } from "./actions";

export function CloseNestedButton({
  engagement,
  role,
  taskId,
  label = "Finish the row",
}: {
  engagement: string;
  role: string;
  taskId: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="start-control">
      <Button
        variant="primary"
        compact
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await closeNestedAction(engagement, role, taskId);
            if (!r.ok) {
              setError(r.error ?? "Could not close it.");
              return;
            }
            router.refresh();
          })
        }
      >
        {pending ? "Finishing…" : label}
      </Button>
      {error && <span className="start-error">{error}</span>}
    </div>
  );
}
