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

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "../../../../_ui/primitives";
import { Markdown } from "../../../../_ui/Markdown";
import { editSectionAction } from "./actions";
import type { Draft } from "@/app/lib/data/job";

const WIDE_KEY = "compass.draft.wide";

export function DraftPanel({ path, draft, engagement, role, taskId, closed = false }: {
  path: string | null; draft: Draft | null; engagement: string; role: string;
  taskId: string;
  /** A closed row's document is the record of what was approved. It is not edited here. */
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
    try { setWide(localStorage.getItem(WIDE_KEY) === "true"); } catch { /* absent is fine */ }
  }, []);

  const toggleWide = () => {
    setWide((w) => {
      try { localStorage.setItem(WIDE_KEY, String(!w)); } catch { /* not worth a failure */ }
      return !w;
    });
  };

  if (!path) return null;

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
        <div className="draft-sections">
          {draft.sections.map((s) => (
            <SectionView
              key={s.id}
              section={s}
              path={path}
              engagement={engagement}
              role={role}
              taskId={taskId}
              editable={!closed}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

function SectionView({ section, path, engagement, role, taskId, editable }: {
  section: Draft["sections"][number];
  path: string; engagement: string; role: string; taskId: string; editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(section.body);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError(null);
      const r = await editSectionAction(engagement, role, taskId, path, section.id, body);
      if (!r.ok) { setError(r.error ?? "Could not save it."); return; }
      setEditing(false);
      router.refresh();
    });

  return (
    <section className="draft-item">
      <div className="draft-item-head">
        <h4 className="draft-heading">{section.heading}</h4>
        {editable && !editing && (
          <button className="draft-edit" onClick={() => { setBody(section.body); setEditing(true); }}>
            Edit
          </button>
        )}
      </div>

      {editing ? (
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
      ) : (
        <Markdown className="draft-body">{section.body}</Markdown>
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
