import { readFileSync, existsSync } from "fs";
import { resolve, normalize } from "path";
import { createHash } from "crypto";
import { supabaseAdmin } from "./supabase";

// The framework's markdown, resolved through three tiers.
//
//   engagement override   this client differs
//   org default           how we work        ← editable in the app, no repo access needed
//   compass/<path>        what Compass ships ← still git, versioned with the release
//
// Both runtimes read through here. The Next app calls resolveSpec directly; the Python
// orchestrator gets a materialized overlay directory (see overlay.ts) and never learns that a
// database is involved.

/** The framework's compass/ dir. THE single definition — it was previously duplicated in
 *  doctree.ts and the intake route, where the two could drift apart silently. */
export const COMPASS_DIR =
  process.env.COMPASS_DIR || `${process.env.COMPASS_REPO || resolve(process.cwd(), "..")}/compass`;

/** Until a real multi-org concept exists. One column, no migration when it does. */
export const DEFAULT_ORG = "default";

// What a human is allowed to edit. Directories of DATA, read by the orchestrator or the app.
// `orchestrator/` is absent on purpose: it is Python source, and an "override" of it would be
// arbitrary remote code execution rather than configuration.
const EDITABLE_DIRS = ["workflows/", "agents/", "templates/", "stacks/", "framework/"];
const EDITABLE_FILES = ["config.yaml"];

export type Tier = "engagement" | "org" | "framework";
export type ResolvedSpec = { path: string; content: string; tier: Tier; updatedAt?: string; updatedBy?: string };

/**
 * Whether `path` may be read or written through this module.
 *
 * Rejects traversal, absolute paths and anything outside the whitelist. This is the security
 * boundary for a surface whose whole job is letting a human edit files on the server, so it fails
 * closed: unknown shapes are refused rather than interpreted.
 */
export function isEditablePath(path: string): boolean {
  if (!path || path !== path.trim()) return false;
  if (path.startsWith("/") || path.includes("\0") || /^[a-zA-Z]:/.test(path)) return false;
  // Normalize FIRST, then re-check: "workflows/../../etc/passwd" starts with an allowed prefix
  // and only reveals itself as traversal once collapsed.
  const norm = normalize(path);
  if (norm.startsWith("..") || norm.includes("../") || norm.startsWith("/")) return false;
  if (EDITABLE_FILES.includes(norm)) return true;
  return EDITABLE_DIRS.some((d) => norm.startsWith(d)) && norm.length > 0;
}

function assertEditable(path: string): string {
  if (!isEditablePath(path)) throw new Error(`Not an editable framework path: ${JSON.stringify(path)}`);
  return normalize(path);
}

/** The shipped default — tier 3. Sync, because it is just a file, and some callers have no
 *  engagement (a fresh install rendering defaults before anything exists). */
export function readFrameworkDefault(path: string): string | null {
  const p = assertEditable(path);
  const full = `${COMPASS_DIR}/${p}`;
  if (!existsSync(full)) return null;
  try { return readFileSync(full, "utf8"); } catch { return null; }
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Resolve one framework file for an engagement, walking the tiers.
 *
 * `engagementId` may be null to resolve org-default-or-framework — which is what the org admin's
 * screens show, and what a workflow with no engagement context reads.
 */
export async function resolveSpec(engagementId: string | null, path: string): Promise<ResolvedSpec | null> {
  const p = assertEditable(path);
  const sb = supabaseAdmin();

  if (sb) {
    if (engagementId) {
      const { data } = await sb.from("spec_file").select("content, updated_at, updated_by")
        .eq("engagement_id", engagementId).eq("path", p).maybeSingle();
      if (data) return { path: p, content: data.content, tier: "engagement", updatedAt: data.updated_at, updatedBy: data.updated_by };
    }
    const { data: org } = await sb.from("spec_file").select("content, updated_at, updated_by")
      .eq("org_id", DEFAULT_ORG).eq("path", p).maybeSingle();
    if (org) return { path: p, content: org.content, tier: "org", updatedAt: org.updated_at, updatedBy: org.updated_by };
  }

  const content = readFrameworkDefault(p);
  return content === null ? null : { path: p, content, tier: "framework" };
}

/** Just the text, or "" — for callers that only want to parse it. */
export async function resolveSpecContent(engagementId: string | null, path: string): Promise<string> {
  return (await resolveSpec(engagementId, path))?.content ?? "";
}

/**
 * Every override that applies to an engagement, as `path → content`, engagement tier winning.
 * This is what the overlay materializer writes over a copy of compass/.
 */
export async function effectiveOverrides(engagementId: string | null): Promise<Record<string, string>> {
  const sb = supabaseAdmin();
  if (!sb) return {};
  const out: Record<string, string> = {};
  const { data: org } = await sb.from("spec_file").select("path, content").eq("org_id", DEFAULT_ORG);
  for (const r of org ?? []) if (isEditablePath(r.path)) out[r.path] = r.content;
  if (engagementId) {
    const { data: eng } = await sb.from("spec_file").select("path, content").eq("engagement_id", engagementId);
    for (const r of eng ?? []) if (isEditablePath(r.path)) out[r.path] = r.content;   // engagement wins
  }
  return out;
}

/**
 * Parse a markdown TABLE out of a `## <section>` block.
 *
 * The one parser. `readSprint0` and `readDefaultDocTree` were near-identical copies of this — same
 * loop, same column slicing, same "skip rows whose first cell isn't a digit" — differing only in
 * which section and which columns.
 *
 * `strict` is what makes this safe for user input. The historical behavior silently SKIPS a
 * malformed row, which is right for a spec the framework controls and wrong for one a human is
 * editing: a fumbled pipe would quietly delete a kickoff ticket with no error anywhere. Callers
 * reading the shipped defaults keep the lenient behavior; the editor passes strict and reports.
 */
export function parseSpecTable<K extends string>(
  content: string, section: string, columns: readonly K[], opts: { strict?: boolean } = {},
): { rows: Record<K, string>[]; errors: string[] } {
  const errors: string[] = [];
  const block = content.split(/^##\s+/m).find((s) => new RegExp(`^${section}`, "i").test(s.trim())) ?? "";
  if (!block) {
    errors.push(`No "## ${section}" section found.`);
    return { rows: [], errors };
  }
  const rows: Record<K, string>[] = [];
  for (const line of block.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    const cells = t.split("|").slice(1, -1).map((x) => x.trim());
    if (!/^\d+$/.test(cells[0] ?? "")) continue;                  // header / separator / prose
    if (cells.length < columns.length + 1) {                      // +1 for the leading index cell
      errors.push(`Row ${cells[0]}: expected ${columns.length} columns, found ${cells.length - 1}.`);
      if (opts.strict) continue;
    }
    const row = {} as Record<K, string>;
    columns.forEach((c, i) => { row[c] = cells[i + 1] ?? ""; });
    const empty = columns.filter((c) => !row[c]);
    if (empty.length) errors.push(`Row ${cells[0]}: empty ${empty.join(", ")}.`);
    if (opts.strict && empty.length) continue;
    rows.push(row);
  }
  if (!rows.length) errors.push(`No data rows in "## ${section}".`);
  return { rows, errors };
}
