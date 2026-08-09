// A line diff, for showing an override against the tier below it.
//
// Hand-rolled rather than pulling a dependency: the app has four runtime deps, this is the only
// place a diff is needed, and the requirement is line-level markdown — not word-level, not
// syntax-aware, not patch-format. ~40 lines of LCS is a smaller liability than a package.

export type DiffLine = { type: "same" | "add" | "remove"; text: string; aLine?: number; bLine?: number };

/**
 * Longest common subsequence over lines, then a walk back to produce the edit script.
 *
 * O(n·m) in time and memory. These files are hundreds of lines, so that is nothing — but it is why
 * `maxLines` exists: a pathological paste should degrade to "too large to diff" rather than
 * hanging the editor while it allocates a 10^8-cell table.
 */
export function diffLines(before: string, after: string, maxLines = 5000): DiffLine[] | null {
  const a = before.split("\n"), b = after.split("\n");
  if (a.length > maxLines || b.length > maxLines) return null;

  // lcs[i][j] = length of the LCS of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i], aLine: i + 1, bLine: j + 1 });
      i++; j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: "remove", text: a[i], aLine: i + 1 });
      i++;
    } else {
      out.push({ type: "add", text: b[j], bLine: j + 1 });
      j++;
    }
  }
  while (i < a.length) out.push({ type: "remove", text: a[i], aLine: ++i });
  while (j < b.length) out.push({ type: "add", text: b[j], bLine: ++j });
  return out;
}

export type DiffStat = { added: number; removed: number; changed: boolean };

export function diffStat(lines: DiffLine[] | null): DiffStat {
  if (!lines) return { added: 0, removed: 0, changed: true };
  const added = lines.filter((l) => l.type === "add").length;
  const removed = lines.filter((l) => l.type === "remove").length;
  return { added, removed, changed: added + removed > 0 };
}

/**
 * Collapse long runs of unchanged lines, keeping `context` either side of each change.
 *
 * Without this a three-line edit to a 400-line workflow renders 400 lines and the change is
 * invisible — which defeats the point of showing a diff at all.
 */
export function collapseUnchanged(lines: DiffLine[], context = 3): (DiffLine | { type: "gap"; count: number })[] {
  const keep = new Set<number>();
  lines.forEach((l, idx) => {
    if (l.type === "same") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) keep.add(k);
  });

  const out: (DiffLine | { type: "gap"; count: number })[] = [];
  let gap = 0;
  lines.forEach((l, idx) => {
    if (keep.has(idx)) {
      if (gap) { out.push({ type: "gap", count: gap }); gap = 0; }
      out.push(l);
    } else gap++;
  });
  if (gap) out.push({ type: "gap", count: gap });
  return out;
}
