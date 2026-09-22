"use client";

import { useState, useTransition } from "react";
import type { OpenQuestion } from "@/app/lib/data/job";
import { answerAction } from "./actions";
import { requestRun } from "./run-agent";
import { uploadAnswer } from "./upload-answer";
import { useRouter } from "next/navigation";

/** What the file picker offers. Everything `readUpload` can actually read, and nothing else. */
const ACCEPT = ".pdf,.docx,.xlsx,.xlsm,.csv,.tsv,.md,.markdown,.txt";

/** The agent's questions, as a form. Blank answers are left open rather than recorded as empty. */
export function AnswerForm({ engagement, role, taskId, questions }: {
  engagement: string; role: string; taskId: string; questions: OpenQuestion[];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  /** Which question's file is being read, so only that control says so. */
  const [uploading, setUploading] = useState<string | null>(null);
  /** What an upload did — "filed 8,742 characters at `sow`". A success worth stating. */
  const [note, setNote] = useState<string | null>(null);
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

            {/* Only where the answer BECOMES a document. On an ordinary question — "how many
                engineers?" — a file picker would be an invitation to upload something nothing
                would file. `filesTo` is the row's own statement that this answer is a deliverable. */}
            {q.filesTo && (
              <div className="ask-upload">
                <label className="ask-upload-label">
                  <input
                    type="file" className="sr-only" accept={ACCEPT}
                    disabled={uploading !== null || pending || working}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      // Cleared before the await: without it, picking the same file twice in a row
                      // fires no change event and the second upload silently never happens.
                      e.target.value = "";
                      if (!file) return;

                      setError(null);
                      setNote(null);
                      setUploading(q.id);
                      const r = await uploadAnswer(engagement, role, taskId, q.id, file);
                      setUploading(null);

                      if (!r.ok) { setError(r.message); return; }
                      setNote(r.message);

                      // Same rule as a typed answer: the last question answered IS the go-ahead.
                      if (r.remaining === 0) {
                        setWorking(true);
                        const run = await requestRun(engagement, role, taskId);
                        setWorking(false);
                        if (!run.ok) setError(run.message);
                      }
                      router.refresh();
                    }}
                  />
                  <span className="btn btn-secondary btn-compact">
                    {uploading === q.id ? "Reading the file…" : "Upload a file"}
                  </span>
                </label>
                <span className="ask-upload-note text-muted">
                  PDF, Word, Excel or text — filed verbatim at <code>{q.filesTo}</code>.
                </span>
              </div>
            )}
          </div>
        );
      })}

      <div className="asks-actions">
        <button
          className="btn btn-primary" disabled={pending || working}
          onClick={() => startTransition(async () => {
            setError(null);
            const r = await answerAction(engagement, role, taskId, values);
            if (!r.ok) { setError(r.error ?? "Could not record that."); return; }
            setValues({});

            // Answering the LAST open question is the whole signal the agent was waiting for.
            // Making someone answer and then separately press Run is asking them to say go twice —
            // John answered seven questions and the task sat at `running` with nothing running.
            // Questions still open means it is still your turn, so nothing fires.
            if (r.remaining === 0) {
              setWorking(true);
              const run = await requestRun(engagement, role, taskId);
              setWorking(false);
              if (!run.ok) setError(run.message);
            }
            router.refresh();
          })}
        >
          {working ? "The agent is working…" : pending ? "Recording…" : "Answer"}
        </button>
        <span className="asks-note text-muted">
          {working
            ? "Answered — it is picking this up. It may come back with a little more, or draft."
            : "Blank answers stay open — the agent still needs them."}
        </span>
        {error && <span className="start-error">{error}</span>}
        {note && !error && <span className="ask-upload-done">{note}</span>}
      </div>
    </div>
  );
}
