import { supabaseAdmin } from "./supabase";

const REPO = process.env.COMPASS_REPO || "/Volumes/VivekSSD/apps/compass";
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
    return {
      args: ["-m", "compass.orchestrator.run", workflow, "--project-dir", repoPath, "--story", storyKey],
      cwd: REPO, scrubCreds: false, real: true, repoName,
      header: `$ compass.orchestrator.run ${workflow} --project-dir ${repoPath} --story ${storyKey}\n$ cwd ${REPO}\n\n`,
    };
  }
  return {
    args: FALLBACK_ARGS, cwd: REPO, scrubCreds: true, real: false, repoName: "",
    header: `$ compass ${workflow} ${storyKey} — CI-parity checks (no repo local_path set — configure one in Settings)\n$ cwd ${REPO}\n\n`,
  };
}
