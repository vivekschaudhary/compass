// Content reads, and the one-time adoption of v1's scaffolded tree.
//
// Compass owns the content, so this is where "what do we know, and who owns it" is answered. It is
// not a destination in the app — content is the input a job reads, surfaced as a pointer — but the
// lineage and permissions view is a real screen, and it reads from here.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./actor";

export type DocNode = {
  id: string;
  path: string;
  title: string;
  kind: "folder" | "doc" | "template";
  depth: number;
  ownerRoleCode: string | null;
  version: string | null;
  status: "draft" | "published" | null;
  /** Which job drafted the live version, when one did. */
  producedBy: string | null;
};

/** The scaffolding tree, flattened for display, deepest path last. */
export async function documentTree(actor: Actor): Promise<DocNode[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data } = await sb.from("document")
    .select("id, path, title, kind, owner_role_code, ord, current_version_id")
    .eq("engagement_id", actor.engagementId)
    .order("path");

  const rows = data ?? [];
  const versionIds = rows.map((r) => r.current_version_id).filter(Boolean) as string[];

  const versions = new Map<string, { version: string; status: string; task: string | null }>();
  if (versionIds.length) {
    const { data: vs } = await sb.from("document_version")
      .select("id, version, status, work_task(title)").in("id", versionIds);
    for (const v of vs ?? []) {
      // PostgREST types an embedded relation as an array even when the foreign key makes it
      // at-most-one. Normalise rather than casting a lie into the type system.
      const embedded = (v as unknown as { work_task?: { title: string } | { title: string }[] | null }).work_task;
      const task = Array.isArray(embedded) ? embedded[0]?.title ?? null : embedded?.title ?? null;
      versions.set(v.id, { version: v.version, status: v.status, task });
    }
  }

  return rows.map((r) => {
    const v = r.current_version_id ? versions.get(r.current_version_id) : undefined;
    return {
      id: r.id,
      path: r.path,
      title: r.title,
      kind: r.kind as DocNode["kind"],
      depth: r.path.split("/").length - 1,
      ownerRoleCode: r.owner_role_code ?? null,
      version: v?.version ?? null,
      status: (v?.status as DocNode["status"]) ?? null,
      producedBy: v?.task ?? null,
    };
  });
}

export type Permission = { path: string; title: string; owns: string | null; edits: string[]; reads: string[] };

/**
 * Who may do what, DERIVED from the workflows rather than stored.
 *
 * A role that produces a document edits it; a role whose step reads it reads it. Nothing overrides
 * it, and there is no table to: `document_permission` was dropped in 030 because an empty override
 * table is an invitation to create a second answer to who may edit a document.
 *
 * Deriving means this cannot drift from the process it describes — change a workflow's `reads` and
 * the permissions follow. When a real exception appears that the workflows cannot express, the
 * override comes back as a migration carrying the case that justified it.
 */
export async function permissions(actor: Actor): Promise<Permission[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const [{ data: docs }, { data: steps }] = await Promise.all([
    sb.from("document").select("id, path, title, owner_role_code")
      .eq("engagement_id", actor.engagementId).neq("kind", "folder").order("path"),
    sb.from("workflow_step").select("role_code, produces, reads, workflow_version!inner(status)")
      .eq("workflow_version.status", "published"),
  ]);

  return (docs ?? []).map((d) => {
    const edits = new Set<string>();
    const reads = new Set<string>();

    for (const s of steps ?? []) {
      if (s.produces === d.path) edits.add(s.role_code);
      if ((s.reads ?? []).includes(d.path)) reads.add(s.role_code);
    }

    const owns = d.owner_role_code ?? null;

    // Owning implies editing; editing implies reading. Listing a role twice says nothing.
    if (owns) edits.add(owns);
    for (const e of edits) reads.delete(e);

    return { path: d.path, title: d.title, owns, edits: [...edits].sort(), reads: [...reads].sort() };
  });
}

/**
 * Adopt v1's scaffolded doc tree into `document`.
 *
 * One-time, idempotent, and deliberately a separate act rather than something the app does on
 * first render: it reads v1's `doc_page` rows, which are the tree the engagement was actually
 * scaffolded with. Inventing a tree instead would have produced a demo that matches the design
 * spec and not the client.
 *
 * Parents are resolved by path prefix after everything is inserted, because a child can appear
 * before its folder in any ordering that is not the one you assumed.
 */
export async function adoptV1DocTree(engagementId: string, orgCode = "default"): Promise<{ adopted: number; linked: number }> {
  const sb = supabaseAdmin();
  if (!sb) return { adopted: 0, linked: 0 };

  const { data: org } = await sb.from("org").select("id").eq("code", orgCode).maybeSingle();
  if (!org) return { adopted: 0, linked: 0 };

  const { data: pages } = await sb.from("doc_page")
    .select("path, title, kind, ord").eq("engagement_id", engagementId).order("ord");
  if (!pages?.length) return { adopted: 0, linked: 0 };

  const { data: existing } = await sb.from("document")
    .select("path").eq("engagement_id", engagementId);
  const have = new Set((existing ?? []).map((d) => d.path));

  const toInsert = pages
    .filter((p) => p.path && !have.has(p.path))
    .map((p, i) => ({
      org_id: org.id, engagement_id: engagementId, path: p.path, title: p.title ?? p.path,
      kind: (["folder", "doc", "template"].includes(p.kind) ? p.kind : "doc"),
      ord: p.ord ?? i,
    }));

  if (toInsert.length) {
    const { error } = await sb.from("document").insert(toInsert);
    if (error) throw new Error(`adopt tree: ${error.message}`);
  }

  // Link parents by path prefix, now that every node exists.
  const { data: all } = await sb.from("document")
    .select("id, path, parent_id").eq("engagement_id", engagementId);
  const byPath = new Map((all ?? []).map((d) => [d.path, d]));

  let linked = 0;
  for (const d of all ?? []) {
    if (d.parent_id) continue;
    const slash = d.path.lastIndexOf("/");
    if (slash < 0) continue;
    const parent = byPath.get(d.path.slice(0, slash));
    if (!parent) continue;
    await sb.from("document").update({ parent_id: parent.id }).eq("id", d.id);
    linked++;
  }

  return { adopted: toInsert.length, linked };
}

export type FlowEdge = { from: string; via: string; to: string };

/**
 * How content moves through the workflows: produced here, read there.
 *
 * NOT the citation graph. Citations record what a claim was actually traced to, and none exist
 * until an agent drafts something — so showing this and calling it lineage would be a claim the
 * data cannot support. This is the DECLARED flow, which is a different and useful thing: it says
 * what the process intends, and later the citations say what actually happened. Where the two
 * disagree is worth looking at.
 */
export async function contentFlow(): Promise<FlowEdge[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: steps } = await sb.from("workflow_step")
    .select("produces, reads, workflow_version!inner(status, workflow(code))")
    .eq("workflow_version.status", "published");

  type Step = { produces: string | null; reads: string[] | null; workflow_version: { workflow: { code: string } | null } | null };
  const rows = (steps ?? []) as unknown as Step[];

  const producedBy = new Map<string, string>();
  for (const s of rows) {
    const wf = s.workflow_version?.workflow?.code;
    if (s.produces && wf) producedBy.set(s.produces, wf);
  }

  const edges: FlowEdge[] = [];
  for (const s of rows) {
    const wf = s.workflow_version?.workflow?.code;
    if (!wf) continue;
    for (const r of s.reads ?? []) {
      edges.push({ from: r, via: wf, to: s.produces || "(no document)" });
    }
  }
  return edges;
}

/** How many claims are traced so far — zero until an agent drafts something. */
export async function citationCount(actor: Actor): Promise<number> {
  const sb = supabaseAdmin();
  if (!sb) return 0;
  const { count } = await sb.from("citation")
    .select("id, document_section!inner(document_version!inner(document!inner(engagement_id)))", { count: "exact", head: true })
    .eq("document_section.document_version.document.engagement_id", actor.engagementId);
  return count ?? 0;
}
