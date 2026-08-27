// The backlog an agent produced, as rows.
//
// `draft-epics` produced a document and the epics inside it were prose, so nothing could turn them
// into Jira issues without parsing headings back out. `backlog-rows.ts` exists because that was
// done once already, and `tools.ts` says plainly why it should not be done again: an outcome that
// has to become rows must arrive as structure.
//
// So the `backlog` tool returns epics and their stories, and this module is the two directions that
// structure travels:
//
//   normaliseBacklog   what the model returned → validated epics, refs deduped, junk dropped
//   sectionsOf         the same structure → document sections, so the FILED record still reads as
//                      a document and every downstream `reads` and citation keeps working
//   recordBacklog      the rows themselves, which are what becomes Jira on approval
//
// The document is not skipped. It is the readable record and the thing citations point at; what
// changes is that it is no longer the ONLY copy, and no longer the one the tracker has to parse.

import "server-only";
import { supabaseAdmin } from "../supabase";

export type BacklogStory = { ref: string; title: string; body: string; cites: string[] };
export type BacklogEpic = BacklogStory & { stories: BacklogStory[] };

export type BacklogRow = {
  id: string;
  kind: "epic" | "story";
  ref: string;
  parentRef: string | null;
  title: string;
  body: string | null;
  ticketKey: string | null;
  ord: number;
};

/**
 * What the model returned, made safe to write.
 *
 * Nothing here is decoration. `strict: true` makes the SHAPE a guarantee; it does not stop a model
 * from reusing a ref, titling an epic with an empty string, or nesting a story under nothing. Each
 * of those would be written to a client's board, and a duplicate ref would then collide on the
 * table's own unique index and fail the whole write — after the Jira issues were already created.
 *
 * Problems are RETURNED, never silently swallowed: an epic that was dropped is a thing the human
 * approving this needs to see.
 */
export function normaliseBacklog(
  raw: unknown,
): { epics: BacklogEpic[]; problems: string[] } {
  const problems: string[] = [];
  const value = typeof raw === "string" ? safeParse(raw) : raw;
  if (!Array.isArray(value)) return { epics: [], problems };

  const seen = new Set<string>();
  const epics: BacklogEpic[] = [];

  for (const [i, entry] of value.entries()) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const title = String(e.title ?? "").trim();
    if (!title) { problems.push(`Dropped an epic at position ${i + 1} with no title.`); continue; }

    // A missing ref is recoverable — the model named the epic, it just did not label it. An
    // ambiguous one is not, so a collision is renamed rather than dropped: losing an epic because
    // two of them were called `E1` would be a worse outcome than a handle nobody reads.
    let ref = String(e.ref ?? "").trim() || `E${i + 1}`;
    if (seen.has(ref)) {
      const next = `${ref}-${i + 1}`;
      problems.push(`Two epics were labelled \`${ref}\`; the second is filed as \`${next}\`.`);
      ref = next;
    }
    seen.add(ref);

    const stories: BacklogStory[] = [];
    const rawStories = Array.isArray(e.stories) ? e.stories : [];
    for (const [j, s] of rawStories.entries()) {
      const st = (s ?? {}) as Record<string, unknown>;
      const stTitle = String(st.title ?? "").trim();
      if (!stTitle) { problems.push(`Dropped a story under \`${ref}\` with no title.`); continue; }
      let stRef = String(st.ref ?? "").trim() || `${ref}-S${j + 1}`;
      if (seen.has(stRef)) {
        const next = `${stRef}-${j + 1}`;
        problems.push(`Two items were labelled \`${stRef}\`; the second is filed as \`${next}\`.`);
        stRef = next;
      }
      seen.add(stRef);
      stories.push({ ref: stRef, title: stTitle, body: String(st.body ?? "").trim(), cites: citesOf(st.cites) });
    }

    // An epic with no stories is kept, not dropped. On a thin engagement that is the honest answer
    // — the epic is real and its decomposition is not knowable yet — and deleting it would hide
    // that from the person approving the backlog.
    if (!stories.length) problems.push(`\`${ref}\` (${title}) has no stories under it.`);

    epics.push({ ref, title, body: String(e.body ?? "").trim(), cites: citesOf(e.cites), stories });
  }

  return { epics, problems };
}

function citesOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * The backlog as document sections.
 *
 * One section per epic, its stories listed inside it. This is what keeps the filed document a
 * document: `recordCitations` writes per-section citations, `priorDraft` reads sections back on a
 * redraft, and every downstream step that `reads` this path gets text it can quote. A backlog that
 * existed only as rows would break all three, quietly.
 */
export function sectionsOf(epics: BacklogEpic[]): { heading: string; body: string; cites: string[] }[] {
  return epics.map((e) => ({
    heading: e.title,
    body: [
      e.body,
      e.stories.length
        ? `**Stories**\n\n` + e.stories.map((s) => `- **${s.title}** — ${s.body}`).join("\n")
        : `_No stories are decomposed under this epic yet._`,
    ].filter(Boolean).join("\n\n"),
    // The epic's own cites plus its stories', so a section's provenance covers everything in it.
    cites: [...new Set([...e.cites, ...e.stories.flatMap((s) => s.cites)])],
  }));
}

/**
 * Write the backlog as rows for this task.
 *
 * REPLACES what the task wrote before. A redraft supersedes its predecessor — leaving the old rows
 * beside the new ones would double the board on approval, and matching them up would be guesswork.
 * Rows that already carry a `ticket_key` are the exception: those exist in Jira, and deleting the
 * local row would orphan a real issue and let the next approval create it a second time.
 */
export async function recordBacklog(
  orgId: string, engagementId: string, taskId: string, epics: BacklogEpic[],
): Promise<{ written: number; problems: string[] }> {
  const sb = supabaseAdmin();
  if (!sb) return { written: 0, problems: ["Supabase is not configured."] };

  const { data: kept } = await sb.from("backlog_item")
    .select("ref").eq("task_id", taskId).not("ticket_key", "is", null);
  const onBoard = new Set((kept ?? []).map((r) => r.ref as string));

  await sb.from("backlog_item").delete().eq("task_id", taskId).is("ticket_key", null);

  const rows: Record<string, unknown>[] = [];
  let ord = 0;
  const problems: string[] = [];
  for (const e of epics) {
    if (onBoard.has(e.ref)) {
      problems.push(`\`${e.ref}\` is already on the board; its ticket was left as it is.`);
    } else {
      rows.push({
        org_id: orgId, engagement_id: engagementId, task_id: taskId,
        kind: "epic", ref: e.ref, parent_ref: null, title: e.title, body: e.body || null, ord: ord++,
      });
    }
    for (const s of e.stories) {
      if (onBoard.has(s.ref)) continue;
      rows.push({
        org_id: orgId, engagement_id: engagementId, task_id: taskId,
        kind: "story", ref: s.ref, parent_ref: e.ref, title: s.title, body: s.body || null, ord: ord++,
      });
    }
  }

  if (!rows.length) return { written: 0, problems };
  const { error } = await sb.from("backlog_item").insert(rows);
  if (error) return { written: 0, problems: [...problems, `Recording the backlog failed: ${error.message}`] };
  return { written: rows.length, problems };
}

/** Everything this task's backlog holds, epics before their stories. */
export async function backlogOf(taskId: string): Promise<BacklogRow[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const { data } = await sb.from("backlog_item")
    .select("id, kind, ref, parent_ref, title, body, ticket_key, ord")
    .eq("task_id", taskId).order("ord");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as "epic" | "story",
    ref: r.ref as string,
    parentRef: (r.parent_ref as string | null) ?? null,
    title: r.title as string,
    body: (r.body as string | null) ?? null,
    ticketKey: (r.ticket_key as string | null) ?? null,
    ord: r.ord as number,
  }));
}
