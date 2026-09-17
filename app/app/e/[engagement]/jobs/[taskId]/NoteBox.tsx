"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { noteAction } from "./actions";

/**
 * The message box, present whatever state the task is in.
 *
 * A closed task used to go silent — readable, but nothing to type into — which is exactly when
 * people start asking about it. Closing is a statement about the work, not about whether anyone
 * may still discuss it, so the note says plainly that it does not reopen anything.
 */
export function NoteBox({ engagement, role, taskId, closed }: {
  engagement: string; role: string; taskId: string; closed: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="note">
      <textarea
        className="input note-input" rows={2} value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={closed ? "Add a note to the record…" : "Say something to the agent…"}
      />
      <div className="note-actions">
        <button
          className="btn btn-secondary" disabled={pending || !body.trim()}
          onClick={() => startTransition(async () => {
            setError(null);
            const r = await noteAction(engagement, role, taskId, body);
            if (!r.ok) setError(r.error ?? "Could not add that.");
            else { setBody(""); router.refresh(); }
          })}
        >
          {pending ? "Adding…" : "Add to the conversation"}
        </button>
        <span className="text-muted note-hint">
          {closed
            ? "This task is closed. A note goes on the record and does not reopen it."
            : "The agent reads this on its next run."}
        </span>
        {error && <span className="start-error">{error}</span>}
      </div>
    </div>
  );
}
