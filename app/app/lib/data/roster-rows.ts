// Reading the roster's table.
//
// Split from the materialiser so the parse can be tested against the real document an agent wrote,
// without a database. Same lesson as the kickoff backlog: the fragile part is the table, and the
// table is what deserves the tests.

export type RosterRow = {
  /** As written — "Enterprise Architect". Mapped to a role code by the caller, against the catalogue. */
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
