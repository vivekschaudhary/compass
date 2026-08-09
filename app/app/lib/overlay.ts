import { cpSync, mkdirSync, writeFileSync, existsSync, rmSync, renameSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { createHash } from "crypto";
import { COMPASS_DIR, effectiveOverrides, isEditablePath } from "./specs";

// Getting an engagement's overrides to the PYTHON orchestrator.
//
// The orchestrator reads its workflows, agents, templates and config from a directory on disk and
// knows nothing about a database — which is the right shape, and worth keeping. So instead of
// teaching it to query Supabase, we build a COPY of the framework's compass/ dir with the
// engagement's overrides written over the top, and point `--compass-dir` at it. Python is
// unchanged; it just reads files, as it always has.
//
// Only the DATA subtrees are copied. The orchestrator's own Python runs from the repo (the spawn
// sets cwd there and invokes `-m compass.orchestrator.run`), so `--compass-dir` supplies content,
// not code — 1.7 MB rather than 4.1 MB, and copying executable source into a writable temp dir
// would be a needless liability.

const DATA_DIRS = ["workflows", "agents", "templates", "stacks", "framework"];
const DATA_FILES = ["config.yaml"];

/** Where overlays live. Under the OS temp dir: they are derived state, rebuildable at any time,
 *  and must never be mistaken for something to back up. */
const OVERLAY_ROOT = process.env.COMPASS_OVERLAY_DIR || join(tmpdir(), "compass-overlays");

export type Overlay = { dir: string; hash: string; fileCount: number; overridden: string[] };

/** Identity of an overlay's CONTENT: the base dir plus every override path and body. Changing any
 *  of them changes the hash, so a stale overlay can never be reused for a changed engagement. */
function overlayHash(baseDir: string, overrides: Record<string, string>): string {
  const h = createHash("sha256").update(baseDir);
  for (const p of Object.keys(overrides).sort()) h.update("\0").update(p).update("\0").update(overrides[p]);
  return h.digest("hex").slice(0, 16);
}

/**
 * Materialize `baseDir` + an engagement's overrides into a directory the orchestrator can read.
 *
 * Returns null when there is nothing to override — the caller then passes the framework dir
 * unchanged, so an engagement that has customized nothing costs nothing and runs against exactly
 * the bytes on disk.
 *
 * `baseDir` is a parameter rather than always COMPASS_DIR because a project may VENDOR its own
 * compass/ projection; the overlay has to be built on whichever directory that run would otherwise
 * have used, or overrides would silently apply to the wrong base.
 */
export async function buildOverlay(engagementId: string | null, baseDir: string = COMPASS_DIR): Promise<Overlay | null> {
  const overrides = await effectiveOverrides(engagementId);
  const paths = Object.keys(overrides).filter(isEditablePath);
  if (!paths.length) return null;

  const hash = overlayHash(baseDir, overrides);
  const dir = join(OVERLAY_ROOT, hash);

  // Content-addressed, so an existing directory with this hash IS this content. Reuse it.
  if (existsSync(join(dir, ".complete"))) {
    return { dir, hash, fileCount: paths.length, overridden: paths.sort() };
  }

  // Build into a scratch dir and move nothing until it is whole: a run must never read a
  // half-copied overlay because two spawns raced.
  const staging = `${dir}.staging-${process.pid}-${Date.now().toString(36)}`;
  try {
    mkdirSync(staging, { recursive: true });
    for (const d of DATA_DIRS) {
      const src = join(baseDir, d);
      if (existsSync(src)) cpSync(src, join(staging, d), { recursive: true });
    }
    for (const f of DATA_FILES) {
      const src = join(baseDir, f);
      if (existsSync(src)) cpSync(src, join(staging, f));
    }
    for (const p of paths) {
      const dest = join(staging, p);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, overrides[p], "utf8");
    }
    writeFileSync(join(staging, ".complete"), hash, "utf8");   // written LAST — it is the barrier

    if (existsSync(dir)) rmSync(staging, { recursive: true, force: true });   // someone won the race
    else {
      try { renameSync(staging, dir); }
      catch { rmSync(staging, { recursive: true, force: true }); }            // lost the race; theirs is fine
    }
  } catch (e) {
    rmSync(staging, { recursive: true, force: true });
    throw e;
  }

  return { dir, hash, fileCount: paths.length, overridden: paths.sort() };
}

/** A line for the run log naming which definitions a run used. Without it, "the workflow did
 *  something unexpected" is unanswerable — you cannot tell whose copy of the spec ran. */
export function overlayHeader(o: Overlay | null): string {
  if (!o) return "[specs] framework defaults (no overrides)\n";
  return `[specs] overlay ${o.hash} — ${o.fileCount} override${o.fileCount === 1 ? "" : "s"}: ${o.overridden.join(", ")}\n`;
}

/** Drop cached overlays. Safe at any time — they are derived and rebuilt on demand. */
export function clearOverlays(): void {
  if (existsSync(OVERLAY_ROOT)) rmSync(OVERLAY_ROOT, { recursive: true, force: true });
}
