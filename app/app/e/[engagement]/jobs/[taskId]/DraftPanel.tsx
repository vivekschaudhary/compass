"use client";

// The deliverable, beside the conversation — and readable.
//
// It was an accordion: sections collapsed, one open at a time, linking to the content screen for
// "the full artifact". The content screen renders no document either, so THERE WAS NOWHERE IN THE
// APP TO READ WHAT THE AGENT WROTE. A reviewer who wanted to read a draft went to Confluence, and
// once there they edited there — where the change has no author, no version and no trail, and the
// next publish silently overwrites it.
//
// So: the sections render in full, in order, exactly as the agent filed them. The structure comes
// from the template the agent was given, not from this component — one place decides what a
// document's shape is, and it is the place that creates it.
//
// Comments are the other half of "readable": a reviewer — or the owner, reading their own draft —
// can select a piece of a section and say something about THAT, not the document as a whole. Not
// gated by role or by this task's own `renders` — see `document_comment`'s migration header for
// why sections outlive any one task's view of them.

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "../../../../_ui/primitives";
import { Markdown } from "../../../../_ui/Markdown";
import {
  editSectionAction, addCommentAction, respondToCommentsAction, decideAnswerAction, applyAcceptedAnswersAction,
  setCommentStatusAction,
} from "./actions";
import type { Draft } from "@/app/lib/data/job";
import type { Comment, DocComment } from "@/app/lib/data/comments";

const WIDE_KEY = "compass.draft.wide";

export function DraftPanel({ path, draft, comments, engagement, role, holderId, taskId, closed = false }: {
  path: string | null; draft: Draft | null;
  /** Every top-level comment on the document, from any version, each with its replies. */
  comments: DocComment[];
  engagement: string; role: string;
  /** Which of `role`'s several holders (if more than one) is acting — see `resolveActor`. */
  holderId?: string | null;
  taskId: string;
  /** A review row reads a document it does not author, so it is never edited here. */
  closed?: boolean;
}) {
  // Per-viewer convenience, not state: it never leaves this browser and nothing else depends on it.
  //
  // Read AFTER mount rather than in a lazy initialiser. The server renders this component too, and
  // it has no `localStorage` — an initialiser that read it would make the first client render
  // disagree with the server's HTML, which React treats as a hydration error. So the panel always
  // starts narrow and widens a frame later if that is what this viewer chose.
  //
  // Both accesses are wrapped: storage throws in a private window and is simply absent on a first
  // visit, and neither is a reason for the document not to render.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    // Deliberate: this MUST run after mount (see above), and the lint rule cannot tell that from the
    // cascading-render case it exists to catch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setWide(localStorage.getItem(WIDE_KEY) === "true"); } catch { /* absent is fine */ }
  }, []);

  const toggleWide = () => {
    setWide((w) => {
      try { localStorage.setItem(WIDE_KEY, String(!w)); } catch { /* not worth a failure */ }
      return !w;
    });
  };

  if (!path) return null;

  // One number per comment across the WHOLE document, in reading order — the badge in the text and
  // the card in the rail share it, which is what lets the eye cross between them.
  const numbers: Record<string, number> = {};
  comments.forEach((c, i) => { numbers[c.id] = i + 1; });
  const bySection: Record<string, DocComment[]> = {};
  for (const c of comments) if (c.sectionId) (bySection[c.sectionId] ??= []).push(c);

  return (
    <aside className={wide ? "draft-col draft-col-wide" : "draft-col"}>
      <div className="draft-head">
        <h6>{path}</h6>
        <div className="draft-head-right">
          {draft
            ? <Tag tone={draft.status === "published" ? "accent-2" : "outline"}>{draft.status} v{draft.version}</Tag>
            : <span className="text-muted draft-none">not drafted yet</span>}
          {draft && (
            <button className="draft-expand" onClick={toggleWide} title={wide ? "Narrow" : "Widen"}>
              {wide ? "⇥" : "⇤"}
            </button>
          )}
        </div>
      </div>

      {draft?.authorKind === "human" && (
        // Said plainly. "A named human reviewed it" is the product's claim, and a version a person
        // wrote must not be indistinguishable from one the agent drafted.
        <p className="draft-author text-muted">
          v{draft.version} was edited by {draft.authoredBy ?? "a person"}.
        </p>
      )}

      {draft && (
       <div className="draft-layout">
        <div className="draft-main">
        <div className="draft-sections">
          {draft.sections.map((s) => (
            <SectionView
              key={s.id}
              section={s}
              comments={(bySection[s.id] ?? []).filter((c) => c.status === "open")}
              numbers={numbers}
              path={path}
              engagement={engagement}
              role={role}
              holderId={holderId}
              taskId={taskId}
              editable={!closed}
            />
          ))}
        </div>
        </div>
        <CommentsRail
          comments={comments} numbers={numbers} currentVersion={draft.version}
          engagement={engagement} role={role} holderId={holderId} taskId={taskId}
          canRespond={!closed}
        />
       </div>
      )}
    </aside>
  );
}

function SectionView({ section, comments, numbers, path, engagement, role, holderId, taskId, editable }: {
  section: Draft["sections"][number];
  comments: Comment[]; numbers: Record<string, number>;
  path: string; engagement: string; role: string; holderId?: string | null; taskId: string; editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(section.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError(null);
      const r = await editSectionAction(engagement, role, taskId, path, section.id, body, holderId);
      if (!r.ok) { setError(r.error ?? "Could not save it."); return; }
      setEditing(false);
      router.refresh();
    });

  const editButton = editable && !editing && (
    <button className="draft-edit" onClick={() => { setBody(section.body); setEditing(true); }}>
      Edit
    </button>
  );

  return (
    <section className="draft-item" id={`section-${section.id}`}>
      {editing ? (
        <>
          <div className="draft-item-head">
            <h4 className="draft-heading">{section.heading}</h4>
            {editButton}
          </div>
          <div className="draft-editor">
            <textarea
              className="input draft-textarea"
              value={body}
              rows={Math.min(30, Math.max(6, body.split("\n").length + 2))}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="draft-editor-actions">
              <button className="btn btn-primary" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save as a new version"}
              </button>
              <button className="btn btn-secondary" onClick={() => { setEditing(false); setError(null); }} disabled={pending}>
                Cancel
              </button>
              {/* Not a detail: an edit here files a version with your name on it, which is the whole
                  reason to edit here rather than in the doc store. */}
              <span className="text-muted draft-editor-note">
                Markdown. Saving files a new version authored by you — it does not overwrite this one.
              </span>
            </div>
            {error && <p className="start-error">{error}</p>}
          </div>
        </>
      ) : (
        // The heading lives INSIDE the same commentable wrapper as the body, not in a separate
        // head row above it — a selection made on "Basis for this roster" itself must reach the
        // same `onMouseUp` handler a selection in the paragraph below it does, or a title-like
        // line is selectable but never triggers the comment button.
        <CommentableBody
          heading={section.heading} editButton={editButton}
          body={section.body} comments={comments} numbers={numbers}
          sectionId={section.id} engagement={engagement} role={role} holderId={holderId} taskId={taskId}
        />
      )}

      {section.edited ? (
        // The citations below describe what the AGENT derived. Once a person has rewritten the
        // prose they no longer account for it, and provenance that reads as verified and is not is
        // worse than none — so the sources are withheld rather than left standing.
        <div className="draft-cites draft-cites-stale">
          Rewritten by a person — the original sources no longer describe this text.
        </div>
      ) : (
        section.cites.length > 0 && (
          <div className="draft-cites">
            from {section.cites.map((c) => `${c.path} v${c.version}`).join(", ")}
          </div>
        )
      )}
    </section>
  );
}

/**
 * Select text, leave a comment. Not gated by role or by whether the row is a review — anyone
 * looking at the document can point at a piece of it, per the migration header on
 * `document_comment`.
 *
 * The floating "+ Comment" button sits right where you selected (fixed, from the selection's own
 * `getBoundingClientRect` — viewport-relative, so it needs no scroll-offset math). The composer
 * itself is NOT a second floating element: it opens anchored under the section instead, which is
 * what keeps this simple in the face of scrolling and viewport edges — a popover chasing a popover
 * is where this kind of feature usually goes wrong.
 */
function CommentableBody({ heading, editButton, body, comments, numbers, sectionId, engagement, role, holderId, taskId }: {
  heading: string; editButton: ReactNode;
  body: string; comments: Comment[]; numbers: Record<string, number>; sectionId: string; engagement: string; role: string;
  holderId?: string | null; taskId: string;
}) {
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [selRect, setSelRect] = useState<{ top: number; left: number } | null>(null);
  const [selText, setSelText] = useState("");
  const [composing, setComposing] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSelect() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !bodyRef.current) { setSelRect(null); return; }
    const text = sel.toString().trim();
    if (!text) { setSelRect(null); return; }
    const range = sel.getRangeAt(0);
    // A selection that starts here and ends in another section — or outside the document
    // entirely — is not a comment ON this section.
    if (!bodyRef.current.contains(range.commonAncestorContainer)) { setSelRect(null); return; }
    const rect = range.getBoundingClientRect();
    setSelRect({ top: rect.top, left: rect.left });
    setSelText(text);
  }

  function openComposer() {
    setComposing(true);
    setSelRect(null);
    window.getSelection()?.removeAllRanges();
  }

  function submitComment() {
    if (!commentBody.trim()) return;
    startTransition(async () => {
      setCommentError(null);
      const r = await addCommentAction(engagement, role, taskId, sectionId, selText, commentBody, holderId);
      if (!r.ok) { setCommentError(r.error ?? "Could not save the comment."); return; }
      setComposing(false);
      setCommentBody("");
      setSelText("");
      router.refresh();
    });
  }

  // Re-highlight on every render this section's comments change — the first occurrence of each
  // comment's stored `quote`, matched against the RENDERED text. A quote that repeats verbatim in
  // the same section can highlight the wrong occurrence; a quote spanning an inline-formatting
  // boundary (bold, a link) cannot be found by this at all, since it never sits inside one text
  // node. Both are accepted MVP limits — the comment still reads in the list below either way.
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    for (const c of comments) {
      const quote = c.quote;
      if (!quote) continue;
      if (root.querySelector(`[data-comment-id="${c.id}"]`)) continue; // already marked
      const n = numbers[c.id];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        if (node.parentElement?.closest(".comment-highlight, .comment-badge")) continue; // don't re-wrap
        const idx = node.data.indexOf(quote);
        if (idx === -1) continue;
        try {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + quote.length);
          const mark = document.createElement("mark");
          mark.className = `comment-highlight ${commentTone(n)}`;
          mark.dataset.commentId = c.id;
          range.surroundContents(mark);
          const badge = document.createElement("span");
          badge.className = `comment-badge ${commentTone(n)}`;
          badge.textContent = String(n);
          mark.after(badge);
        } catch { /* crosses a node boundary the Range API cannot wrap — skip, the rail still shows it */ }
        break;
      }
    }
     
  }, [comments, body, numbers]);

  return (
    <div className="commentable">
      <div ref={bodyRef} onMouseUp={handleSelect}>
        <div className="draft-item-head">
          <h4 className="draft-heading">{heading}</h4>
          {editButton}
        </div>
        <Markdown className="draft-body">{body}</Markdown>
      </div>

      {selRect && (
        <button
          className="comment-trigger"
          style={{ top: selRect.top - 34, left: selRect.left }}
          onClick={openComposer}
        >
          + Comment
        </button>
      )}

      {composing && (
        <div className="comment-composer">
          <p className="comment-composer-quote">“{selText}”</p>
          <textarea
            className="input comment-composer-input"
            rows={2}
            placeholder="What's the comment?"
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            autoFocus
          />
          <div className="comment-composer-actions">
            <button className="btn btn-primary btn-compact" onClick={submitComment} disabled={pending || !commentBody.trim()}>
              {pending ? "Saving…" : "Comment"}
            </button>
            <button
              className="btn btn-secondary btn-compact" disabled={pending}
              onClick={() => { setComposing(false); setCommentBody(""); setCommentError(null); }}
            >
              Cancel
            </button>
          </div>
          {commentError && <p className="start-error">{commentError}</p>}
        </div>
      )}

    </div>
  );
}

/** Four tones, cycled — terracotta, olive, slate, plum. The number alone picks it, so the badge in the text and the card in the rail always agree. */
function commentTone(n: number): string {
  return `comment-tone-${(n - 1) % 4}`;
}

/** Is this comment waiting for an answer? Open, and no answer that is undecided or accepted. */
function needsAnswer(c: DocComment): boolean {
  return c.status === "open" && !c.replies.some((r) => r.stance && r.decision !== "declined");
}

/** The accepted answer waiting to be applied, if this comment has one. */
function acceptedAnswer(c: DocComment): Comment | undefined {
  if (c.status !== "open") return undefined;
  return [...c.replies].reverse().find((r) => r.stance && r.decision === "accepted");
}

/**
 * The comments, in a fixed-width column beside the document. Each card's "Jump to anchor" scrolls
 * to the highlight in the text; a comment whose quote can no longer be found (see the re-match note
 * in `CommentableBody`) falls back to its section, so the button never does nothing.
 *
 * On a drafting row (`canRespond`) the column also carries the loop for closing them: ask the agent
 * for a short answer to every open comment, accept or decline each answer, then apply everything
 * accepted as one new version. None of it reopens the task — see `comment-respond.ts`.
 */
function CommentsRail({ comments, numbers, currentVersion, engagement, role, holderId, taskId, canRespond }: {
  comments: DocComment[]; numbers: Record<string, number>; currentVersion: string;
  engagement: string; role: string; holderId?: string | null; taskId: string; canRespond: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [next, setNext] = useState("");

  const toAnswer = comments.filter(needsAnswer).length;
  const toApply = comments.filter((c) => acceptedAnswer(c)).length;
  const numberOf = (id: string) => numbers[id];

  function jump(c: DocComment) {
    const target =
      document.querySelector(`[data-comment-id="${c.id}"]`) ??
      (c.sectionId ? document.getElementById(`section-${c.sectionId}`) : null);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("comment-flash");
    setTimeout(() => target.classList.remove("comment-flash"), 1400);
  }

  function run(label: string, work: () => Promise<{ ok: boolean; error?: string; text?: string }>) {
    startTransition(async () => {
      setBusy(label);
      setMessage(null);
      const r = await work();
      setBusy(null);
      setMessage({ text: r.ok ? (r.text ?? "Done.") : (r.error ?? "That did not work."), failed: !r.ok });
      if (r.ok) router.refresh();
    });
  }

  const respond = () => run("respond", async () => {
    const r = await respondToCommentsAction(engagement, role, taskId, holderId);
    return { ...r, text: `Answered ${r.answered ?? 0} comment${r.answered === 1 ? "" : "s"}.` };
  });

  const apply = () => run("apply", async () => {
    const r = await applyAcceptedAnswersAction(engagement, role, taskId, holderId);
    const filed = r.version ? `Filed v${r.version}. ` : "";
    return { ...r, text: `${filed}Resolved ${r.resolved ?? 0}.${r.note ? ` ${r.note}` : ""}` };
  });

  const setStatus = (commentId: string, to: "resolved" | "open") => run(`status-${commentId}`, async () => {
    const r = await setCommentStatusAction(engagement, role, taskId, commentId, to, holderId);
    return { ...r, text: to === "resolved" ? "Resolved." : "Reopened." };
  });

  const accept = (answerId: string) => run(`accept-${answerId}`, async () => {
    const r = await decideAnswerAction(engagement, role, taskId, answerId, "accepted", undefined, holderId);
    return { ...r, text: "Accepted. It applies with the next version." };
  });

  const decline = (answerId: string) => run(`decline-${answerId}`, async () => {
    const r = await decideAnswerAction(engagement, role, taskId, answerId, "declined", { reason, next }, holderId);
    if (r.ok) { setDeclining(null); setReason(""); setNext(""); }
    return { ...r, text: "Declined. The agent will see why." };
  });

  return (
    <div className="comments-rail">
      <h6 className="comments-rail-title">Comments · {comments.length}</h6>

      {canRespond && comments.length > 0 && (
        <div className="comments-rail-actions">
          <button className="btn btn-secondary btn-compact" onClick={respond} disabled={pending || toAnswer === 0}>
            {busy === "respond" ? "Thinking…" : `Suggest responses (${toAnswer})`}
          </button>
          <button className="btn btn-primary btn-compact" onClick={apply} disabled={pending || toApply === 0}>
            {busy === "apply" ? "Applying…" : `Apply accepted (${toApply})`}
          </button>
        </div>
      )}
      {message && (
        <p className={message.failed ? "start-error" : "comments-rail-status"}>{message.text}</p>
      )}

      {comments.length === 0 && (
        <p className="text-muted comments-rail-empty">Select text in the document to comment on it.</p>
      )}

      {comments.map((c) => (
        <div key={c.id} className="comment-card" data-status={c.status}>
          <div className="comment-card-head">
            <span className={`comment-badge comment-badge-static ${commentTone(numberOf(c.id))}`}>{numberOf(c.id)}</span>
            <span className="comment-card-author">{c.authorUserId ?? c.authorRoleCode ?? "someone"}</span>
            {c.version !== currentVersion && <span className="comment-from">from v{c.version}</span>}
          </div>
          <p className="comment-card-body">{c.body}</p>

          {c.replies.map((r) => r.stance ? (
            <div key={r.id} className="comment-answer">
              <div className="comment-answer-label">
                Suggested · {r.stance === "change" ? "would change the text" : "no change"}
              </div>
              <p className="comment-answer-text">{r.body}</p>
              {r.overlapsWith.length > 0 && (
                <p className="comment-answer-meta">
                  Same fix as {r.overlapsWith.map((id) => `#${numberOf(id) ?? "?"}`).join(", ")}
                </p>
              )}
              {r.decision === null && canRespond && c.status === "open" && (
                declining === r.id ? (
                  <div className="comment-decline-form">
                    <textarea
                      className="input comment-composer-input" rows={2} placeholder="Why not?"
                      value={reason} onChange={(e) => setReason(e.target.value)} autoFocus
                    />
                    <textarea
                      className="input comment-composer-input" rows={2} placeholder="What should happen instead?"
                      value={next} onChange={(e) => setNext(e.target.value)}
                    />
                    <div className="comment-composer-actions">
                      <button
                        className="btn btn-primary btn-compact" onClick={() => decline(r.id)}
                        disabled={pending || !reason.trim() || !next.trim()}
                      >
                        Decline
                      </button>
                      <button
                        className="btn btn-secondary btn-compact" disabled={pending}
                        onClick={() => { setDeclining(null); setReason(""); setNext(""); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="comment-answer-actions">
                    <button className="btn btn-primary btn-compact" onClick={() => accept(r.id)} disabled={pending}>
                      Accept
                    </button>
                    <button className="btn btn-secondary btn-compact" onClick={() => setDeclining(r.id)} disabled={pending}>
                      Decline
                    </button>
                  </div>
                )
              )}
              {r.decision === "accepted" && (
                <p className="comment-answer-meta">
                  {c.status === "open" ? `Accepted by ${r.decidedBy ?? "someone"} — applies with the next version.` : `Accepted by ${r.decidedBy ?? "someone"}.`}
                </p>
              )}
              {r.decision === "declined" && (
                <p className="comment-answer-meta">Declined by {r.decidedBy ?? "someone"}.</p>
              )}
            </div>
          ) : (
            <p key={r.id} className="comment-reply">
              <span className="comment-card-author">{r.authorUserId ?? r.authorRoleCode ?? "someone"}</span> {r.body}
            </p>
          ))}

          <div className="comment-card-foot">
            <button className="comment-card-jump" onClick={() => jump(c)}>Jump to anchor →</button>
            {/* Anyone looking at the document may resolve or reopen — a review row included, since the
                reviewer is the one who knows whether the point was met. */}
            {c.status === "open"
              ? <button className="comment-card-jump" onClick={() => setStatus(c.id, "resolved")} disabled={pending}>Resolve</button>
              : <button className="comment-card-jump" onClick={() => setStatus(c.id, "open")} disabled={pending}>Reopen</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
