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
};

/**
 * The section's document must be in the actor's engagement — three lookups rather than one
 * embedded query, matching how `draftOf` walks the same chain (document → version → section).
 */
async function sectionInScope(
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
  }).select("id, quote, body, author_kind, author_role_code, author_user_id, status, created_at").single();
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

  return {
    ok: true,
    comment: {
      id: data.id, quote: data.quote, body: data.body,
      authorKind: data.author_kind, authorRoleCode: data.author_role_code, authorUserId: data.author_user_id,
      status: data.status, createdAt: data.created_at,
    },
  };
}

/** Every comment on a set of sections, oldest first — the shape `DraftPanel` reads per section. */
export async function commentsForSections(sectionIds: string[]): Promise<Map<string, Comment[]>> {
  const sb = supabaseAdmin();
  const out = new Map<string, Comment[]>();
  if (!sb || !sectionIds.length) return out;

  const { data } = await sb.from("document_comment")
    .select("id, document_section_id, quote, body, author_kind, author_role_code, author_user_id, status, created_at")
    .in("document_section_id", sectionIds).order("created_at");

  for (const c of data ?? []) {
    const entry: Comment = {
      id: c.id, quote: c.quote, body: c.body,
      authorKind: c.author_kind, authorRoleCode: c.author_role_code, authorUserId: c.author_user_id,
      status: c.status, createdAt: c.created_at,
    };
    out.set(c.document_section_id, [...(out.get(c.document_section_id) ?? []), entry]);
  }
  return out;
}
