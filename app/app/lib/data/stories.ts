// The stories an agent drafted for ONE epic, as rows.
//
// The `backlog` tool produces a whole backlog: epics, and the stories under each. This is the other
// half of that decomposition, run later and per epic — `refine-stories` is started for one epic,
// reads the feature and the epic, and returns only the stories that epic still needs.
//
// Three decisions shape the module:
//
//   NEVER OVERRIDE. Running the workflow again for an epic ADDS stories. Stories that already
//   exist — drafted earlier, on the board, in a sprint — are carried into the document exactly as
//   they are and are not touched, renamed or re-numbered. The agent is shown them so it does not
//   draft the same story twice, and a title that repeats one is dropped here regardless.
//
//   REFS ARE OURS. The agent never numbers a story. A ref is `<epic>-S<n>` with `n` continuing from
//   the highest the epic already has, anywhere in the engagement — because the sprint plan
//   commits by ref across the whole engagement, and two epics each calling a story `S1` would be
//   one story as far as it is concerned.
//
//   A STORY WITHOUT ACCEPTANCE CRITERIA IS NOT A STORY. It is dropped and said so, not filed. The
//   approver sees what was dropped; a story nobody can test is not ready to commit to a sprint and
//   would sit on the board looking as if it were.
//
// Pure functions first, so the rules are testable without a database; the two that touch it are at
// the bottom and are thin.

import "server-only";
import { supabaseAdmin } from "../supabase";

/** A story as the model returns it. */
export type StoryInput = {
  title: string;
  description: string;
  acceptance: string[];
  notes: string;
  cites: string[];
};

/** A story that already exists for the epic, as the table holds it. */
export type ExistingStory = {
  ref: string;
  title: string;
  body: string | null;
  ticketKey: string | null;
  ord: number;
};

export type AddedStory = StoryInput & { ref: string; body: string; ord: number };

export type StoriesPlan = {
  existing: ExistingStory[];
  added: AddedStory[];
  problems: string[];
  sections: { heading: string; body: string; cites: string[] }[];
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function listOf(raw: unknown): string[] {
  const v = typeof raw === "string" ? [raw] : raw;
  return Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
}

/**
 * The markdown a story carries — on the board as its description and in the document as its
 * section. The three headings are the standard shape, in a fixed order, so every story reads the
 * same wherever it is opened.
 */
export function storyBody(s: Pick<StoryInput, "description" | "acceptance" | "notes">): string {
  return [
    `## Description\n${s.description.trim()}`,
    `## Acceptance criteria\n${s.acceptance.map((a) => `- ${a}`).join("\n")}`,
    `## Notes\n${s.notes.trim() || "None."}`,
  ].join("\n\n");
}

/** `ACC-E1-S4` → 4. A ref that does not follow the pattern counts as nothing, not as zero. */
export function storyNumber(epicRef: string, ref: string): number | null {
  const m = ref.match(/-S(\d+)$/i);
  if (!m || !ref.toLowerCase().startsWith(epicRef.toLowerCase())) return null;
  return Number(m[1]);
}

/**
 * What the model returned, made safe to file, against what the epic already has.
 *
 * Problems are RETURNED, never swallowed: every story that was dropped is something the person
 * approving this needs to see, because "five stories" reads as complete whether or not the model
 * drafted seven.
 */
export function planStoriesFor(
  epicRef: string,
  existing: ExistingStory[],
  raw: unknown,
): StoriesPlan {
  const problems: string[] = [];
  const value = typeof raw === "string" ? safeParse(raw) : raw;

  const taken = new Set(existing.map((e) => norm(e.title)));
  let n = existing.reduce((max, e) => Math.max(max, storyNumber(epicRef, e.ref) ?? 0), 0);
  let ord = existing.reduce((max, e) => Math.max(max, e.ord), -1);

  const added: AddedStory[] = [];
  if (Array.isArray(value)) {
    for (const [i, entry] of value.entries()) {
      const e = (entry ?? {}) as Record<string, unknown>;
      const title = String(e.title ?? "").trim();
      const label = title ? `"${title}"` : `the story at position ${i + 1}`;
      if (!title) { problems.push(`Dropped ${label}: it has no title.`); continue; }

      const description = String(e.description ?? "").trim();
      if (!description) { problems.push(`Dropped ${label}: it has no description.`); continue; }

      const acceptance = listOf(e.acceptance_criteria ?? e.acceptance);
      if (!acceptance.length) {
        problems.push(`Dropped ${label}: it has no acceptance criteria, so nobody could tell when it is done.`);
        continue;
      }

      if (taken.has(norm(title))) {
        problems.push(`Dropped ${label}: ${epicRef} already has a story with that title.`);
        continue;
      }
      taken.add(norm(title));

      const story: StoryInput = {
        title, description, acceptance,
        notes: String(e.notes ?? "").trim(),
        cites: listOf(e.cites),
      };
      n += 1;
      ord += 1;
      added.push({ ...story, ref: `${epicRef}-S${n}`, body: storyBody(story), ord });
    }
  }

  const sections = [
    ...existing.map((s) => ({
      heading: `${s.ref} — ${s.title}`,
      body: s.body ?? "",
      cites: [] as string[],
    })),
    ...added.map((s) => ({ heading: `${s.ref} — ${s.title}`, body: s.body, cites: s.cites })),
  ];

  return { existing, added, problems, sections };
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * The stories an epic already has — what a new run must carry and not repeat.
 *
 * Stories this task wrote earlier and that are not on the board yet are EXCLUDED: a redraft inside
 * one run replaces its own previous attempt, exactly as a redrafted backlog does. Anything with a
 * ticket, and anything another run filed, stays.
 */
export async function existingStoriesOf(
  engagementId: string, epicRef: string, taskId: string,
): Promise<ExistingStory[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const { data } = await sb.from("backlog_item")
    .select("ref, title, body, ticket_key, ord, task_id")
    .eq("engagement_id", engagementId).eq("kind", "story").eq("parent_ref", epicRef)
    .order("ord");
  return (data ?? [])
    .filter((r) => !(r.task_id === taskId && !r.ticket_key))
    .map((r) => ({
      ref: r.ref as string,
      title: r.title as string,
      body: (r.body as string | null) ?? null,
      ticketKey: (r.ticket_key as string | null) ?? null,
      ord: r.ord as number,
    }));
}

/**
 * Write the NEW stories as rows for this task, with no ticket keys — the board gets them on
 * approval. Replaces only this task's own unfiled rows; nothing any other run wrote is touched.
 */
export async function recordStories(
  orgId: string, engagementId: string, taskId: string, epicRef: string, added: AddedStory[],
): Promise<{ written: number; problems: string[] }> {
  const sb = supabaseAdmin();
  if (!sb) return { written: 0, problems: ["Supabase is not configured."] };

  await sb.from("backlog_item").delete().eq("task_id", taskId).is("ticket_key", null);
  if (!added.length) return { written: 0, problems: [] };

  const { error } = await sb.from("backlog_item").insert(added.map((s) => ({
    org_id: orgId, engagement_id: engagementId, task_id: taskId,
    kind: "story", ref: s.ref, parent_ref: epicRef, title: s.title, body: s.body, ord: s.ord,
  })));
  if (error) return { written: 0, problems: [`Recording the stories failed: ${error.message}`] };
  return { written: added.length, problems: [] };
}
