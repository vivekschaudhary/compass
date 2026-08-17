"use client";

import Link from "next/link";
import { useState } from "react";
import { Tag } from "../../../../_ui/primitives";
import { Markdown } from "../../../../_ui/Markdown";
import type { Draft } from "@/app/lib/data/job";

/**
 * The deliverable, beside the conversation.
 *
 * Sections are collapsed by default and open one at a time. A nine-section document rendered flat
 * beside a chat means neither is readable — and the full artifact has a better home on the content
 * screen, which this links to rather than trying to replace.
 */
export function DraftPanel({ path, draft, engagement, role }: {
  path: string | null; draft: Draft | null; engagement: string; role: string;
}) {
  const [openSection, setOpenSection] = useState<string | null>(null);

  if (!path) return null;

  return (
    <aside className="draft-col">
      <div className="draft-head">
        <h6>{path}</h6>
        {draft
          ? <Tag tone={draft.status === "published" ? "accent-2" : "outline"}>{draft.status} v{draft.version}</Tag>
          : <span className="text-muted draft-none">not drafted yet</span>}
      </div>

      {draft && (
        <>
          <div className="draft-sections">
            {draft.sections.map((s) => {
              const open = openSection === s.id;
              return (
                <div key={s.id} className="draft-item">
                  <button className="draft-toggle" onClick={() => setOpenSection(open ? null : s.id)}>
                    <span className="draft-caret">{open ? "▾" : "▸"}</span>
                    {s.heading}
                  </button>
                  {open && (
                    <div className="draft-open">
                      <Markdown className="draft-body">{s.body}</Markdown>
                      {s.cites.length > 0 && (
                        <div className="draft-cites">
                          from {s.cites.map((c) => `${c.path} v${c.version}`).join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Link href={`/v2/e/${engagement}/content?role=${role}`} className="draft-link">
            Open in Shared content →
          </Link>
        </>
      )}
    </aside>
  );
}
