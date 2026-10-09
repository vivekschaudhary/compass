// A comment on a piece of a document — the select-and-say-something a reviewer or an owner leaves
// on a section, rather than a note that dangles off the whole file.
//
// Anchored to `document_section`, not to a task: sections are per document VERSION, and the same
// version is read from whichever task currently gates it. Nothing here restricts WHO may comment —
// the scope check is the same one every document read already makes (the section's document must
// be in the actor's engagement), same as `turn`.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./actor";
import { emit } from "./events";

export type Comment = {
  id: string;
  quote: string;
  body: string;
  authorKind: "human" | "agent" | "system";
  authorRoleCode: string | null;
  authorUserId: string | null;
  status: "open" | "resolved";
  createdAt: string;
  /** Set on a reply; null on a top-level comment. A reply answers one top-level comment, never another reply. */
  parentId: string | null;
  /** On an agent's answer: would it change the text, or not. Null on everything else. */
  stance: "change" | "no_change" | null;
  /** Other comments the same fix would cover. */
  overlapsWith: string[];
  /** What was decided about an answer. Null until someone decides, and always null off an answer. */
  decision: "accepted" | "declined" | null;
  decidedBy: string | null;
  /** Replies, oldest first. Always empty on a reply itself. */
  replies: Comment[];
};

// One literal, not a concatenation: the client types a select from its string, and a built string
// degrades every row to an error type.
const COLUMNS = "id, document_section_id, parent_id, quote, body, author_kind, author_role_code, author_user_id, status, stance, overlaps_with, decision, decided_by, created_at" as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toComment(c: any): Comment {
  return {
    id: c.id, quote: c.quote, body: c.body,
    authorKind: c.author_kind, authorRoleCode: c.author_role_code, authorUserId: c.author_user_id,
    status: c.status, createdAt: c.created_at,
    parentId: c.parent_id ?? null, stance: c.stance ?? null, overlapsWith: c.overlaps_with ?? [],
    decision: c.decision ?? null, decidedBy: c.decided_by ?? null,
    replies: [],
  };
}

/**
 * The section's document must be in the actor's engagement — three lookups rather than one
 * embedded query, matching how `draftOf` walks the same chain (document → version → section).
 */
export async function sectionInScope(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>, actor: Actor, sectionId: string,
): Promise<boolean> {
  const { data: section } = await sb.from("document_section")
    .select("document_version_id").eq("id", sectionId).maybeSingle();
  if (!section) return false;

  const { data: version } = await sb.from("document_version")
    .select("document_id").eq("id", section.document_version_id).maybeSingle();
  if (!version) return false;

  const { data: doc } = await sb.from("document")
    .select("id").eq("id", version.document_id).eq("engagement_id", actor.engagementId).maybeSingle();
  return Boolean(doc);
}

/** Leave a comment on one section, selected text and all. */
export async function addComment(
  actor: Actor, sectionId: string, quote: string, body: string,
): Promise<{ ok: true; comment: Comment } | { ok: false; error: string }> {
  const q = quote.trim();
  const b = body.trim();
  if (!q) return { ok: false, error: "Select some text to comment on." };
  if (!b) return { ok: false, error: "Say what the comment is." };

  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  if (!(await sectionInScope(sb, actor, sectionId)))
    return { ok: false, error: "That section is not in your engagement." };

  const who = actor.holder ?? actor.roleCode;
  const { data, error } = await sb.from("document_comment").insert({
    document_section_id: sectionId,
    quote: q,
    body: b,
    author_kind: "human",
    author_role_code: actor.roleCode,
    author_user_id: who,
  }).select(COLUMNS).single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save the comment." };

  await emit({
    engagementId: actor.engagementId,
    subjectType: "document_section",
    subjectId: sectionId,
    verb: "comment.added",
    actorKind: "human",
    actorRoleCode: actor.roleCode,
    actorUserId: who,
    payload: { commentId: data.id, quote: q },
  });

  return { ok: true, comment: toComment(data) };
}

/** A top-level comment as the document panel shows it: where it was made, and where it lands now. */
export type DocComment = Comment & {
  /** The heading of the section it was made on, on the version it was made on. */
  heading: string;
  /** The version it was made on. A comment from an earlier version is carried forward, not re-made. */
  version: string;
  /**
   * The CURRENT version's section with the same heading — where its highlight can go. Null when that
   * section no longer exists; the comment still shows in the list, just without a highlight.
   */
  sectionId: string | null;
};

/**
 * Every top-level comment on a document, from ANY of its versions, oldest first, each with its replies.
 *
 * Across versions because a comment survives the edit it prompted: it stays until someone resolves it,
 * and an edit that did not settle it must not make it vanish from the page. Sections are recreated per
 * version, so a comment is matched to the current version by HEADING — the same way `editSection`
 * carries `edited` forward, and with the same limit: a renamed section no longer matches.
 *
 * A reply never appears at the top level; it is part of the conversation under its comment.
 */
export async function commentsForDocument(actor: Actor, path: string | null): Promise<DocComment[]> {
  const sb = supabaseAdmin();
  if (!sb || !path) return [];

  const { data: doc } = await sb.from("document")
    .select("id, current_version_id").eq("engagement_id", actor.engagementId).eq("path", path).maybeSingle();
  if (!doc) return [];

  const { data: versions } = await sb.from("document_version").select("id, version").eq("document_id", doc.id);
  const versionOf = new Map((versions ?? []).map((v) => [v.id as string, v.version as string]));
  if (!versionOf.size) return [];

  const { data: sections } = await sb.from("document_section")
    .select("id, heading, document_version_id").in("document_version_id", [...versionOf.keys()]);
  const sectionRows = sections ?? [];
  const meta = new Map(sectionRows.map((s) => [s.id as string, s]));
  const currentByHeading = new Map(
    sectionRows.filter((s) => s.document_version_id === doc.current_version_id).map((s) => [s.heading as string, s.id as string]),
  );
  if (!meta.size) return [];

  const { data } = await sb.from("document_comment")
    .select(COLUMNS).in("document_section_id", [...meta.keys()]).order("created_at");
  const rows = data ?? [];

  const repliesOf = new Map<string, Comment[]>();
  for (const r of rows) {
    if (!r.parent_id) continue;
    repliesOf.set(r.parent_id, [...(repliesOf.get(r.parent_id) ?? []), toComment(r)]);
  }

  return rows.filter((r) => !r.parent_id).map((r) => {
    const sec = meta.get(r.document_section_id)!;
    return {
      ...toComment(r),
      replies: repliesOf.get(r.id) ?? [],
      heading: sec.heading as string,
      version: versionOf.get(sec.document_version_id as string) ?? "",
      sectionId: currentByHeading.get(sec.heading as string) ?? null,
    };
  });
}
