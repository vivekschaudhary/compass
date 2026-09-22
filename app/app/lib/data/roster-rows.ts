// Reading the roster's table.
//
// Split from the materialiser so the parse can be tested against the real document an agent wrote,
// without a database. Same lesson as the kickoff backlog: the fragile part is the table, and the
// table is what deserves the tests.

export type RosterRow = {
  /** As written — "Principal Engineer". Mapped to a role code by the caller, against the catalogue. */
  roleLabel: string;
  /** The person, or null where the row deliberately records a vacancy. */
  holder: string | null;
};

const cells = (line: string) => line.replace(/^\||\|$/g, "").split("|").map((s) => s.trim());

/** "**Jill**" → "Jill", "`pm`" → "pm". Agents emphasise names; the emphasis is not the name. */
const plain = (s: string) => s.replace(/[*`_]/g, "").trim();

/** A holder cell that records an absence rather than a person. */
const VACANT = /^(unassigned|unstaffed|vacant|tbd|tbc|—|-|n\/a|none)$/i;

/**
 * Every row of the first table that has both a role column and a holder column.
 *
 * Headers are matched by NAME, never by position — the agent writes the header, and a parser that
 * assumed column order would break the first time it wrote "Holder" before "Role".
 */
const HEADING = "Roster";

/**
 * What the `roster` tool returned, made safe to render.
 *
 * A blank role is dropped and reported — same posture as `normaliseBacklog`'s dropped epics: the
 * approver needs to know a row went missing, not just receive a shorter table. A blank holder is
 * kept: it is a real answer (the role is open), not a malformed one.
 */
export function normaliseRosterRows(
  raw: unknown,
): { rows: { role: string; holder: string }[]; problems: string[] } {
  const problems: string[] = [];
  const value = Array.isArray(raw) ? raw : [];
  const rows: { role: string; holder: string }[] = [];
  for (const [i, entry] of value.entries()) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const role = String(e.role ?? "").trim();
    if (!role) { problems.push(`Dropped row ${i + 1} with no role.`); continue; }
    rows.push({ role, holder: String(e.holder ?? "").trim() });
  }
  return { rows, problems };
}

/**
 * The `roster` tool's rows, rendered as the exact table `parseRoster` already reads.
 *
 * Deliberately the same two header words `parseRoster`'s regex matches (`Role`, `Holder`) — the
 * point of this function is that nothing downstream has to change: the tool forces the agent to
 * hand back structure instead of prose it hopes the parser finds, and the render/parse round trip
 * stays exactly what it already was.
 *
 * A literal `|` in a name would shift every column after it — the same corruption
 * `sprint-rows.ts` guards against — and `parseRoster` has no escaping to undo, so it is stripped
 * here rather than escaped.
 */
export function rosterSection(
  rows: { role: string; holder: string }[],
): { heading: string; body: string; cites: string[] } {
  const cell = (s: string) => (s ?? "").replace(/\|/g, "/").replace(/\n+/g, " ").trim();
  const lines = rows.map((r) => `| ${cell(r.role)} | ${cell(r.holder) || "—"} |`);
  const body = ["| Role | Holder |", "|---|---|", ...lines].join("\n");
  return { heading: HEADING, body, cites: [] };
}

export function parseRoster(markdown: string): RosterRow[] {
  const lines = markdown.split("\n").map((l) => l.trim());

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("|")) continue;
    const header = cells(lines[i]).map((h) => h.toLowerCase());
    const iRole = header.findIndex((h) => /^role\b|^discipline\b/.test(h));
    const iHolder = header.findIndex((h) => /holder|person|name|who/.test(h));
    if (iRole < 0 || iHolder < 0) continue;

    const rows: RosterRow[] = [];
    for (let j = i + 1; j < lines.length && lines[j].startsWith("|"); j++) {
      const c = cells(lines[j]);
      if (c.every((x) => /^-*$/.test(x))) continue;      // the |---| rule
      if (c.length < header.length) continue;

      const roleLabel = plain(c[iRole]);
      const holder = plain(c[iHolder]);
      if (!roleLabel) continue;
      rows.push({ roleLabel, holder: VACANT.test(holder) || !holder ? null : holder });
    }
    return rows;
  }
  return [];
}
