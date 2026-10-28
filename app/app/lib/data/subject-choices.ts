// What a workflow can be started ABOUT, read from the backlog — the server half of
// `lib/subject-kinds.ts`. One finder per kind, one entry point for the picker and one for the start
// flow, so what the picker offers and what the start flow accepts are the same set by construction.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "./actor";
import type { SubjectChoice, SubjectKind } from "../subject-kinds";

type Row = {
  kind: string; ref: string; title: string; ticket_key: string | null;
  parent_ref: string | null; ord: number | null;
};

async function backlogRows(engagementId: string): Promise<Row[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const { data } = await sb.from("backlog_item")
    .select("kind, ref, title, ticket_key, parent_ref, created_at, ord")
    .eq("engagement_id", engagementId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Row[];
}

/**
 * The items of one kind that reached the board, newest backlog first. Several backlogs may have used
 * the same handle; the copy with a ticket is the one that is real, and the first one seen wins.
 */
function onBoard(rows: Row[], kind: "epic" | "story"): Map<string, Row & { ticket_key: string }> {
  const out = new Map<string, Row & { ticket_key: string }>();
  for (const r of rows) {
    if (r.kind === kind && r.ticket_key && !out.has(r.ref)) out.set(r.ref, r as Row & { ticket_key: string });
  }
  return out;
}

const byOrd = (a: { ord: number | null }, b: { ord: number | null }) => (a.ord ?? 0) - (b.ord ?? 0);

/**
 * Epics on the board, each with how many stories it has so the person can see what has been refined
 * and what has not. An epic with no ticket is not offered: the stories drafted for it would have no
 * parent to be filed under.
 */
function epicChoices(rows: Row[]): SubjectChoice[] {
  const stories = new Map<string, number>();
  for (const r of rows) {
    if (r.kind === "story" && r.parent_ref) stories.set(r.parent_ref, (stories.get(r.parent_ref) ?? 0) + 1);
  }
  return [...onBoard(rows, "epic").values()].sort(byOrd).map((e) => {
    const n = stories.get(e.ref) ?? 0;
    return { ref: e.ref, title: e.title, ticketKey: e.ticket_key, detail: `${n} ${n === 1 ? "story" : "stories"}` };
  });
}

/**
 * Stories on the board, in epic order then story order, each tagged with the epic's key. A story with
 * no ticket is not offered: a build reports its pull request on the story's ticket, and a ticketless
 * story has nowhere to put it.
 */
function storyChoices(rows: Row[]): SubjectChoice[] {
  const epics = onBoard(rows, "epic");
  const epicOrd = (s: Row) => epics.get(s.parent_ref ?? "")?.ord ?? Number.MAX_SAFE_INTEGER;
  return [...onBoard(rows, "story").values()]
    .sort((a, b) => epicOrd(a) - epicOrd(b) || byOrd(a, b))
    .map((s) => ({
      ref: s.ref, title: s.title, ticketKey: s.ticket_key,
      detail: epics.get(s.parent_ref ?? "")?.ticket_key ?? s.parent_ref,
    }));
}

const FINDERS: Record<SubjectKind, (rows: Row[]) => SubjectChoice[]> = {
  epic: epicChoices,
  story: storyChoices,
};

/** What a picker offers for each of these kinds — one read of the backlog for all of them. */
export async function subjectChoicesFor(
  actor: Actor, kinds: SubjectKind[],
): Promise<Partial<Record<SubjectKind, SubjectChoice[]>>> {
  if (!kinds.length) return {};
  const rows = await backlogRows(actor.engagementId);
  return Object.fromEntries([...new Set(kinds)].map((k) => [k, FINDERS[k](rows)]));
}

/**
 * Is `ref` a `kind` this engagement has, and is it on the board? Said plainly with the reason, since
 * the start flow shows it to the person who clicked.
 */
export async function usableSubject(
  engagementId: string, kind: SubjectKind, ref: string,
): Promise<{ ok: true; subject: { ref: string; title: string; ticketKey: string } } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };
  const rows = await backlogRows(engagementId);
  const mine = rows.filter((r) => r.kind === kind && r.ref === ref);
  if (!mine.length) return { ok: false, error: `This engagement has no ${kind} '${ref}'.` };
  const found = mine.find((r) => r.ticket_key);
  if (!found) {
    return {
      ok: false,
      error: `${kind[0].toUpperCase()}${kind.slice(1)} '${ref}' (${mine[0].title}) is not on the board yet — ` +
        (kind === "epic" ? "approve the epics first." : "approve its stories first."),
    };
  }
  return { ok: true, subject: { ref, title: found.title, ticketKey: found.ticket_key as string } };
}
