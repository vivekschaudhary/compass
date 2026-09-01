// The sprint's commitments, rendered into the plan and read back out of it.
//
// WHY THE DOCUMENT CARRIES THEM. Compass keeps no table of what is in a sprint — Jira does, and
// everything downstream asks Jira. But there is a gap between the agent DRAFTING a plan and a human
// APPROVING it, and only on approval does anything reach the board. `materialiseFrom` hands a
// materialiser the reassembled markdown and the task id, and nothing else. So between those two
// moments the commitments live where every other deliverable's structure lives: in the document.
//
// That is the pattern already in use, not a workaround — `materialiseRoster` parses the roster out
// of `01-foundation/team` the same way. What is deliberately NOT done is letting the model write
// this table freehand: `render` builds it from the tool's structured input, so the round trip is
// mechanical and testable. The lesson from `backlog_item` still holds — an outcome that has to
// become rows arrives as structure — and it is honoured by the TOOL being structured, not by the
// markdown being clever.
//
// Split from the materialiser so the parse can be tested against a real document, with no database.

export type Commitment = {
  /** The backlog item's own handle — `E1-S3`. Stable across the draft; not a Jira key. */
  ref: string;
  /** The Jira issue, when the story reached the board. Null is a real state, and a reported one. */
  ticketKey: string | null;
  title: string;
  /** The delivery role that owns it — a role code, e.g. `designer`. */
  ownerRole: string;
  /** One line: why that role owns it. Editorial, and the reason a human can check the routing. */
  why: string;
};

const HEADING = "Commitments";

/** A cell that records an absence rather than a value. Mirrors `roster-rows.ts`'s VACANT. */
const ABSENT = /^(—|-|n\/a|none|tbd|tbc)$/i;

/**
 * A row's cells, splitting on UNESCAPED pipes only.
 *
 * A naive `split("|")` is what a markdown table parser usually gets away with, and here it silently
 * corrupts data: a story titled "Export as CSV | TSV" splits into an extra cell, every column after
 * it shifts left, and the Owner column is read out of the Why column. The sprint is then assigned
 * to a role nobody has — and nothing reports it, because the row parsed fine.
 */
const cells = (line: string) =>
  line
    .replace(/^\||(?<!\\)\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((s) => s.trim());

/**
 * "**KAN-12**" → "KAN-12", and `\|` → `|`. Agents emphasise; the emphasis is not the value.
 *
 * Unescaping is the other half of `cell()`'s escaping — done here rather than in the caller so the
 * round trip is closed in one place.
 */
const plain = (s: string) => s.replace(/\\\|/g, "|").replace(/[*`_]/g, "").trim();

/** A pipe inside a cell would end the cell. Escaped rather than dropped — the text is a person's. */
const cell = (s: string) => (s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();

/**
 * The commitments as one markdown section, built from the tool's input.
 *
 * Deterministic, so `parseCommitments(commitmentsSection(x))` returns `x`. A story that never
 * reached the board renders an em dash in the Ticket column rather than an empty cell — an empty
 * cell reads as a rendering bug, and this is a fact somebody needs to act on.
 */
export function commitmentsSection(commitments: Commitment[]): { heading: string; body: string; cites: string[] } {
  const rows = commitments.map((c) =>
    `| ${cell(c.ref)} | ${cell(c.ticketKey ?? "—")} | ${cell(c.title)} | ${cell(c.ownerRole)} | ${cell(c.why)} |`,
  );
  const body = [
    "| Ref | Ticket | Story | Owner | Why |",
    "|---|---|---|---|---|",
    ...rows,
  ].join("\n");

  return { heading: HEADING, body, cites: [] };
}

/**
 * The sprint's own facts, at the top of the plan.
 *
 * Rendered rather than left to the agent's prose for the same reason the commitments table is: the
 * number has to be the one that was allocated. An agent asked to "say which sprint this is" writes
 * whichever number it inferred, and a page that says Sprint 2 over labels that say `sprint-3` is
 * two records of one sprint — exactly what keeping no sprint table is meant to prevent.
 *
 * Dates are passed through as the agent gave them. They are the plan's claim about itself, not a
 * fact anything downstream depends on, so a malformed one is a readable mistake rather than a
 * broken label.
 */
export function overviewSection(
  s: { number: number; goal: string; starts: string; ends: string },
): { heading: string; body: string; cites: string[] } {
  return {
    heading: `Sprint ${s.number}`,
    body: [
      `**Goal.** ${s.goal || "_Not stated._"}`,
      ``,
      `| | |`,
      `|---|---|`,
      `| Sprint | ${s.number} |`,
      `| Starts | ${cell(s.starts) || "—"} |`,
      `| Ends | ${cell(s.ends) || "—"} |`,
    ].join("\n"),
    cites: [],
  };
}

/**
 * Every row of the first table that has a ref column, an owner column and a ticket column.
 *
 * Headers matched by NAME, never by position — same rule as `parseRoster`, and for the same reason:
 * requiring all three is the discriminator that stops this pulling in the roster table or a
 * capacity table that also happens to have an Owner column.
 */
export function parseCommitments(markdown: string): { commitments: Commitment[]; problems: string[] } {
  const lines = markdown.split("\n").map((l) => l.trim());
  const problems: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("|")) continue;
    const header = cells(lines[i]).map((h) => h.toLowerCase());
    const iRef = header.findIndex((h) => /^ref\b|handle/.test(h));
    const iTicket = header.findIndex((h) => /ticket|issue|key/.test(h));
    const iTitle = header.findIndex((h) => /story|title|summary/.test(h));
    const iOwner = header.findIndex((h) => /owner|role|discipline/.test(h));
    const iWhy = header.findIndex((h) => /why|reason|rationale/.test(h));

    // A table missing a column this depends on is NOT silently zero rows. Reported, then we keep
    // looking — the plan may carry a capacity table above the commitments.
    if (iRef < 0 || iOwner < 0) continue;
    if (iTicket < 0) {
      problems.push(
        `A commitments table at line ${i + 1} has no Ticket column, so no story could be matched ` +
        `to an issue. The sprint was not put on the board.`,
      );
      continue;
    }

    const commitments: Commitment[] = [];
    for (let j = i + 1; j < lines.length && lines[j].startsWith("|"); j++) {
      const c = cells(lines[j]);
      if (c.every((x) => /^:?-*:?$/.test(x))) continue;         // the |---| rule
      if (c.length < header.length) {
        problems.push(`Row ${j + 1} of the commitments table has fewer cells than it has columns.`);
        continue;
      }

      const ref = plain(c[iRef]);
      const ownerRole = plain(c[iOwner]).toLowerCase();
      if (!ref) continue;
      if (!ownerRole || ABSENT.test(ownerRole)) {
        problems.push(`\`${ref}\` names no owning role, so nobody could be assigned to it.`);
        continue;
      }

      const ticket = plain(c[iTicket]);
      commitments.push({
        ref,
        ticketKey: !ticket || ABSENT.test(ticket) ? null : ticket,
        title: iTitle >= 0 ? plain(c[iTitle]) : ref,
        ownerRole,
        why: iWhy >= 0 ? plain(c[iWhy]) : "",
      });
    }

    if (commitments.length || problems.length) return { commitments, problems };
  }

  return { commitments: [], problems };
}
