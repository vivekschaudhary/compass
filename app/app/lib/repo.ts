import { existsSync } from "fs";
import { supabaseAdmin } from "./supabase";

const REPO = process.env.COMPASS_REPO || "/Volumes/VivekSSD/apps/compass";
// The framework's compass/ dir — where workflows/agents load from when a project doesn't vendor its
// own projection (e.g. compass-app building itself). Consumers that DO vendor one aren't affected.
const COMPASS_DIR = process.env.COMPASS_DIR || `${REPO}/compass`;
const FALLBACK_ARGS = ["-m", "unittest", "discover", "-s", "compass/orchestrator/tests"];

// discipline → candidate repo areas (Design/Product don't build code)
const AREA_BY_DISCIPLINE: Record<string, string[]> = {
  Engineering: ["frontend", "backend", "shared"],
  QA: ["qa-automation", "shared"],
  Design: [],
  Product: [],
};

export type RunPlan = { args: string[]; cwd: string; scrubCreds: boolean; header: string; real: boolean; repoName: string };

// Resolve a story to its target repo and produce the spawn plan. If the repo has a real
// local_path → the REAL orchestrator command against that repo (creds passed). Else → the
// safe CI-parity check-suite fallback (creds scrubbed). This is the multi-repo resolution:
// every story runs in exactly one repo, chosen by its epic's discipline/area.
export async function resolveRunPlan(storyKey: string, workflow: "build" | "fix"): Promise<RunPlan> {
  const sb = supabaseAdmin();
  let repoPath = "", repoName = "";

  if (sb && storyKey) {
    const { data: story } = await sb.from("story").select("epic_id").eq("id", storyKey).maybeSingle();
    if (story?.epic_id) {
      const { data: epic } = await sb.from("epic").select("engagement_id, discipline").eq("id", story.epic_id).maybeSingle();
      if (epic) {
        const { data: repos } = await sb.from("repo").select("*").eq("engagement_id", epic.engagement_id).order("ord");
        const areas = AREA_BY_DISCIPLINE[epic.discipline] ?? [];
        const repo = (repos ?? []).find((r) => areas.includes(r.area)) ?? (repos ?? []).find((r) => r.area === "shared") ?? (repos ?? [])[0];
        if (repo?.local_path) { repoPath = repo.local_path; repoName = repo.name ?? repo.key; }
      }
    }
  }

  if (repoPath) {
    // Workflows/agents load from <project-dir>/compass by default. A project that doesn't vendor the
    // framework projection (compass-app building itself) has none → point --compass-dir at the
    // framework the app runs from so the orchestrator finds build.md et al. A project that vendors
    // its own projection is left untouched (no flag → default project-local resolution + overrides).
    const compassDir = existsSync(`${repoPath}/compass`) ? "" : COMPASS_DIR;
    const compassArg = compassDir ? ["--compass-dir", compassDir] : [];
    return {
      // --non-interactive: the app spawns this headless (no stdin), so the orchestrator must never
      // prompt for per-step context — otherwise input() deadlocks the run at step 2+ (run.py:854).
      args: ["-m", "compass.orchestrator.run", workflow, "--project-dir", repoPath, ...compassArg, "--story", storyKey, "--non-interactive"],
      cwd: REPO, scrubCreds: false, real: true, repoName,
      header: `$ compass.orchestrator.run ${workflow} --project-dir ${repoPath}${compassDir ? ` --compass-dir ${compassDir}` : ""} --story ${storyKey} --non-interactive\n$ cwd ${REPO}\n\n`,
    };
  }
  return {
    args: FALLBACK_ARGS, cwd: REPO, scrubCreds: true, real: false, repoName: "",
    header: `$ compass ${workflow} ${storyKey} — CI-parity checks (no repo local_path set — configure one in Settings)\n$ cwd ${REPO}\n\n`,
  };
}
