"use client";

import { useState } from "react";
import { Tag } from "../../../../_ui/primitives";
import type { PinnedInput } from "@/app/lib/agent/context";
import type { StoredStatus } from "@/app/lib/data/gates";
import { Gate } from "../Gate";

/**
 * What the agent read and what it is measured against — one line, openable.
 *
 * This was a full column and it earned its space exactly once: the first time you look at a job.
 * After that it is the same three documents and the same five criteria, pushing the conversation
 * into a third of the screen. The summary line keeps the one fact that changes — how many inputs
 * were missing — and the rest is a click away.
 */
export function ContextStrip({ inputs, doneCriteria, statuses, produces }: {
  inputs: PinnedInput[]; doneCriteria: string[]; statuses: StoredStatus[]; produces: string | null;
}) {
  const [open, setOpen] = useState(false);
  const missing = inputs.filter((i) => !i.body).length;
  const ready = statuses.filter((s) => s.kind === "ready");
  const met = ready.filter((s) => s.satisfied === true).length;

  return (
    <div className={open ? "ctx ctx-open" : "ctx"}>
      <button className="ctx-summary" onClick={() => setOpen(!open)}>
        <span className="ctx-caret">{open ? "▾" : "▸"}</span>
        <span>reads {inputs.length}</span>
        {missing > 0 && <span className="ctx-warn">{missing} not drafted</span>}
        {ready.length > 0 && <span>ready {met}/{ready.length}</span>}
        <span>done {doneCriteria.length} criteria</span>
        {produces && <span className="ctx-produces">produces {produces}</span>}
      </button>

      {open && (
        <div className="ctx-detail">
          <div>
            <h6>Reads</h6>
            {inputs.map((i) => (
              <div key={i.path} className={i.body ? "pin" : "pin pin-missing"}>
                <span className="pin-title">{i.title ?? i.path}</span>
                <span className="pin-path">{i.path}</span>
                {i.version
                  ? <Tag tone="accent-2">pinned v{i.version}</Tag>
                  : <span className="pin-none">not drafted — read as empty</span>}
              </div>
            ))}
          </div>
          <div>
            <h6>Done when</h6>
            <ul className="done-list">
              {doneCriteria.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
          <div><Gate statuses={statuses} kind="ready" /></div>
        </div>
      )}
    </div>
  );
}
