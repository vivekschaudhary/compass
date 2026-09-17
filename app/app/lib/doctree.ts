import { readFrameworkDefault, parseSpecTable } from "./specs";

// The workspace doc tree, as the framework ships it in compass/templates/doc-tree.md.
//
// The app reads it for one thing: the catalogue of DECLARED document paths. The seed importer
// (lib/import/store.ts) accepts a step that produces or reads a path declared here before any
// document at that path exists — otherwise declaring a new document and the step that reads it could
// never land in one commit.
//
// What this module used to do, and no longer does: seed a per-engagement copy of the tree into
// `doc_tree_spec`, let it be refined, and scaffold it into Confluence or SharePoint
// (`seedDocTreeSpec`, `getEngagementDocTree`, `scaffoldDocs`). Only v1's intake called those, and they
// were deleted with it. The history is in git if scaffolding comes back.

// A node in the workspace doc tree. `parent` is another node's `path`, or "" for a top-level node.
export type DocNode = { path: string; title: string; kind: "folder" | "doc" | "template"; parent: string; body?: string };

export const DOC_TREE_PATH = "templates/doc-tree.md";
const DOC_TREE_COLUMNS = ["path", "title", "kind", "parent"] as const;

function toNodes(rows: Record<(typeof DOC_TREE_COLUMNS)[number], string>[]): DocNode[] {
  return rows.map((r) => ({
    path: r.path, title: r.title,
    kind: r.kind === "folder" || r.kind === "template" ? r.kind : "doc",
    parent: r.parent === "—" ? "" : r.parent,
  }));
}

/** The shipped tree, ignoring every override. */
export function readShippedDocTree(): DocNode[] {
  const content = readFrameworkDefault(DOC_TREE_PATH);
  return content ? toNodes(parseSpecTable(content, "Nodes", DOC_TREE_COLUMNS).rows) : [];
}
