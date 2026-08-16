// A CSV parser, hand-rolled and deliberately small.
//
// No dependency for thirty lines of well-specified format, and the framework's own scripts hold
// the same line ("keep them single-file and minimal-dependency"). What it does need to handle is
// what a spreadsheet actually exports, which is not the same as what a developer writes by hand:
//
//   • a UTF-8 BOM on the front — Excel adds one, and it silently corrupts the first header name,
//     so `code` becomes `﻿code` and every lookup misses
//   • CRLF line endings
//   • quoted fields containing commas and newlines
//   • "" as an escaped quote inside a quoted field
//   • a trailing newline, or none
//
// Each of those is a real file someone will upload, and each fails in a way that looks like a
// data problem rather than a parsing one.

/** One parsed row of raw cells. */
export type Cells = string[];

/** Split CSV text into rows of cells. */
export function parseCsv(input: string): Cells[] {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const rows: Cells[] = [];
  let row: Cells = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }   // "" → a literal quote
        else quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(cell); cell = ""; continue; }
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }

  // A trailing newline leaves nothing pending; anything else is a final unterminated row.
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }

  return rows;
}

/**
 * Parse into records keyed by header.
 *
 * Blank lines are dropped — a spreadsheet export routinely carries them and they are never
 * meaningful. Values are trimmed; header names are trimmed and lower-cased, so `Code` and `code`
 * are the same column and nobody loses an afternoon to a capital letter.
 */
export function parseRecords(input: string): Record<string, string>[] {
  const rows = parseCsv(input).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { rec[h] = (cells[i] ?? "").trim(); });
    return rec;
  });
}

/** Split a multi-value cell — `"claude,codex"` → `["claude","codex"]`. Empty cell → `[]`. */
export function parseList(cell: string | undefined): string[] {
  if (!cell) return [];
  return cell.split(",").map((s) => s.trim()).filter(Boolean);
}

/** `true`/`yes`/`1` are true; empty is the caller's default. Anything else is false. */
export function parseBool(cell: string | undefined, fallback = true): boolean {
  if (cell === undefined || cell === "") return fallback;
  return ["true", "yes", "1", "y"].includes(cell.trim().toLowerCase());
}
