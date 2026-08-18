// Reading the kickoff backlog's table.
//
// Split from `backlog.ts` because parsing a markdown table has no business importing `server-only`
// — and because this is the part worth testing against the real document the agent produced.

export type BacklogRow = {
  /** The row's own id — `PS0-02`. v1 called this the ticket. */
  ref: string;
  work: string;
  /** The workflow that satisfies it, or null when the row names none. */
  workflowCode: string | null;
  ownerRole: string | null;
  /** v1 matched on the GATE, not the title: a title is text a DM may reword. */
  exit: string;
};

/**
 * Read the rows out of the authored backlog.
 *
 * Column ORDER is not assumed — the agent writes the header, and a port that hardcoded positions
 * would break the first time it wrote `Owner` before `Workflow`. Headers are matched by name.
 */
export function parseBacklog(markdown: string): BacklogRow[] {
  const lines = markdown.split("\n").map((l) => l.trim());
  const rows: BacklogRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("|")) continue;
    const header = cells(lines[i]).map((h) => h.toLowerCase());
    // Workflow FIRST, then the work — because "workflow" contains "work", and looking for the
    // work column first claimed the workflow column and put a backticked code in the title.
    const iFlow = header.findIndex((h) => /workflow/.test(h));
    const iWork = header.findIndex((h, k) => k !== iFlow && /work|ticket/.test(h));
    if (iFlow < 0 || iWork < 0) continue;

    const iRef = header.findIndex((h) => /^#|^id$/.test(h));
    const iOwner = header.findIndex((h) => /owner|role/.test(h));
    const iExit = header.findIndex((h) => /exit|gate|done/.test(h));

    // Past the header and its `|---|` rule, until the table ends.
    for (let j = i + 1; j < lines.length && lines[j].startsWith("|"); j++) {
      const c = cells(lines[j]);
      if (c.every((x) => /^-*$/.test(x))) continue;
      if (c.length < header.length) continue;

      rows.push({
        ref: iRef >= 0 ? c[iRef] : String(rows.length + 1),
        work: c[iWork],
        // `\`staff-engagement\` (1 step)` → `staff-engagement`. A row whose workflow is an em-dash
        // or prose names none, and that is a legitimate row — v1's ticket 1 ("Connect systems of
        // record") had no workflow either, because intake itself satisfies it.
        workflowCode: (c[iFlow].match(/`([a-z0-9-]+)`/) ?? [])[1] ?? null,
        // Em or en dash only. A plain hyphen splits `delivery-manager` into `delivery`, which is
        // not a role — the person's name is separated by a dash of the longer kind.
        ownerRole: iOwner >= 0 ? (c[iOwner].split(/[—–]/)[0].trim() || null) : null,
        exit: iExit >= 0 ? c[iExit] : "",
      });
    }
    i = lines.length;
  }

  return rows;
}

const cells = (line: string) =>
  line.replace(/^\||\|$/g, "").split("|").map((s) => s.trim());
