// The engagement's document tree, narrowed into the task page's left column.
//
// Same data and the same flat, depth-indented shape as `/content` — `documentTree` was never a
// nested/collapsible tree to begin with (it derives `depth` from `path.split("/").length`, not from
// `parent_id`), so this reuses it as-is rather than building a second tree widget. The one thing
// this view adds: the document THIS task itself produces is marked rather than linked away, since
// that one is already on screen in `DraftPanel` — following the link would just reopen this page.

import type { DocNode } from "@/app/lib/data/documents";
import { Tag } from "../../../../_ui/primitives";

export function DocTreeNav({
  engagement,
  roleCode,
  tree,
  produces,
}: {
  engagement: string;
  roleCode: string;
  tree: DocNode[];
  /** This task's own output path, if any — marked rather than linked. */
  produces: string | null;
}) {
  if (!tree.length) return null;

  return (
    <nav className="doc-nav">
      <h6 className="doc-nav-head">Content</h6>
      <div className="doc-tree doc-tree-nav">
        {tree.map((n) => {
          const isThisTask = produces !== null && n.path === produces;
          return (
            <div
              key={n.id}
              className={isThisTask ? "doc-row doc-row-current" : "doc-row"}
              style={{ paddingLeft: `${n.depth * 14}px` }}
            >
              {n.kind === "folder" || !n.status ? (
                <span className={n.kind === "folder" ? "doc-name doc-name-folder" : "doc-name"}>
                  {n.title}
                </span>
              ) : isThisTask ? (
                <span className="doc-name doc-name-current">{n.title}</span>
              ) : (
                <a className="doc-name" href={`/e/${engagement}/content/${n.path}?role=${roleCode}`}>
                  {n.title}
                </a>
              )}
              {isThisTask && <Tag tone="accent">this task</Tag>}
              {!isThisTask && n.status === "published" && <Tag tone="accent-2">v{n.version}</Tag>}
              {!isThisTask && n.status === "draft" && <Tag tone="outline">draft</Tag>}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
