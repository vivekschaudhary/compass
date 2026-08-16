"use client";

import { useState, useTransition } from "react";
import type { OpenQuestion } from "@/app/lib/data/job";
import { answerAction } from "./actions";

/** The agent's questions, as a form. Blank answers are left open rather than recorded as empty. */
export function AnswerForm({ engagement, role, taskId, questions }: {
  engagement: string; role: string; taskId: string; questions: OpenQuestion[];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (id: string, v: string) => setValues((p) => ({ ...p, [id]: v }));

  return (
    <div className="asks">
      <div className="asks-head">
        {questions.length} question{questions.length === 1 ? "" : "s"} waiting on you
      </div>

      {questions.map((q) => {
        const [head, ...rest] = q.prompt.split("\n");
        return (
          <div key={q.id} className="ask">
            <label className="ask-prompt" htmlFor={`q-${q.id}`}>{head}</label>
            {rest.join("\n").trim() && <div className="ask-why">{rest.join("\n").trim()}</div>}
            {q.type === "choice" && q.options?.length ? (
              <div className="ask-options">
                {q.options.map((o) => (
                  <label key={o} className={values[q.id] === o ? "seg-opt seg-opt-on" : "seg-opt"}>
                    <input
                      type="radio" name={`q-${q.id}`} value={o} className="sr-only"
                      checked={values[q.id] === o} onChange={() => set(q.id, o)}
                    />
                    {o}
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                id={`q-${q.id}`} className="input ask-input" rows={2}
                value={values[q.id] ?? ""} onChange={(e) => set(q.id, e.target.value)}
                placeholder={q.type === "number" ? "a number" : "your answer"}
              />
            )}
          </div>
        );
      })}

      <div className="asks-actions">
        <button
          className="btn btn-primary" disabled={pending}
          onClick={() => startTransition(async () => {
            setError(null);
            const r = await answerAction(engagement, role, taskId, values);
            if (!r.ok) setError(r.error ?? "Could not record that.");
            else setValues({});
          })}
        >
          {pending ? "Recording…" : "Answer"}
        </button>
        <span className="asks-note text-muted">
          Blank answers stay open — the agent still needs them.
        </span>
        {error && <span className="start-error">{error}</span>}
      </div>
    </div>
  );
}
