"use client";

import { useState } from "react";
import { Markdown } from "../../../../_ui/Markdown";
import type { Turn } from "@/app/lib/data/job";

/**
 * The conversation, as a conversation.
 *
 * Two things make a long agent thread unreadable, and both were present: every run appended a
 * four-hundred-word summary with nothing collapsed, so five runs read as five essays; and a
 * message that is genuinely long has no business being fully expanded when you are looking for
 * what happened last.
 *
 * So: only the last exchange is open. Everything before it collapses behind one line, and any
 * single message past a few hundred characters clamps with its own control. The default view is
 * "what just happened", which is what someone opening a job actually wants.
 */
export function Conversation({ turns }: { turns: Turn[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!turns.length) {
    return <p className="text-muted pane-empty">Nothing yet. Run the agent and it will read the pinned documents.</p>;
  }

  const recent = turns.slice(-2);
  const earlier = turns.slice(0, -2);

  return (
    <div className="chat">
      {earlier.length > 0 && !showAll && (
        <button className="chat-earlier" onClick={() => setShowAll(true)}>
          Show {earlier.length} earlier message{earlier.length === 1 ? "" : "s"}
        </button>
      )}
      {(showAll ? turns : recent).map((t) => <Message key={t.id} turn={t} />)}
    </div>
  );
}

const LONG = 700;

function Message({ turn }: { turn: Turn }) {
  const [open, setOpen] = useState(false);
  const long = turn.body.length > LONG;
  const shown = long && !open ? turn.body.slice(0, LONG).trimEnd() + "…" : turn.body;

  return (
    <article className={`msg msg-${turn.authorKind}`}>
      <div className="msg-who">
        <span>{turn.authorKind === "agent" ? `${turn.authorRoleCode ?? "agent"} agent` : turn.authorUserId ?? "you"}</span>
        <span className="msg-when">
          {new Date(turn.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </span>
      </div>
      <Markdown className="msg-body">{shown}</Markdown>
      {long && (
        <button className="msg-more" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </article>
  );
}
