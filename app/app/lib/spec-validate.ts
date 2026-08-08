import { spawn } from "child_process";
import { resolve } from "path";

// Run `compass.orchestrator.validate` over a draft and return what the orchestrator's own parsers
// extracted from it.
//
// Shelling Python from a request is not free, so this is called on blur and before save — never
// per keystroke. The alternative (reimplementing graph.py's regexes in TypeScript) would drift
// from the parser that actually runs, which is the precise failure this exists to prevent.

const REPO = process.env.COMPASS_REPO || resolve(process.cwd(), "..");

export type SpecKind = "workflow" | "agent" | "table" | null;

export type WorkflowStep = {
  n: number; title: string; hitl: boolean;
  agent: string | null; task: string | null; agent_file: string | null;
  artifact_target: string | null; routes: [string, string | number][] | null;
};

export type ValidateResult =
  | { kind: "workflow"; ok: boolean; has_dispatch_graph: boolean; steps: WorkflowStep[];
      hitl_count: number; agents: string[]; requires_approved: string[]; warnings: string[] }
  | { kind: "agent"; ok: boolean; preferred_hosts: string[]; executor_tools: string[];
      model_tier: string | null; loads_bet_catalog: boolean; has_frontmatter: boolean; warnings: string[] }
  | { kind: "table"; ok: boolean; rows: Record<string, string>[]; warnings: string[] };

/** Table specs need their section + columns; keep the mapping in ONE place so the editor, the
 *  validator and the readers cannot disagree about what a file's columns are. */
const TABLE_SPECS: Record<string, { section: string; columns: string[] }> = {
  "templates/sprint-0.md": { section: "Tickets", columns: ["ticket", "workflow", "owner", "gate"] },
  "templates/doc-tree.md": { section: "Nodes", columns: ["path", "title", "kind", "parent"] },
};

/** What kind of structural validation a path is subject to. `null` = prose we cannot check
 *  mechanically (most templates, config.yaml, framework notes) — saved without a structural gate,
 *  which is honest rather than pretending to verify something we cannot. */
export function specKind(path: string): SpecKind {
  if (path.startsWith("workflows/") && path.endsWith(".md")) return "workflow";
  if (path.startsWith("agents/") && path.endsWith(".md")) return "agent";
  if (TABLE_SPECS[path]) return "table";
  return null;
}

/**
 * Validate `content` as the given kind. Returns null when the kind is null (nothing to check).
 *
 * Never throws into a request path: a missing python3, a crash, or a hang all resolve to an
 * explicit not-ok result. "We could not check it" must never read as "it is fine" — the same rule
 * the readiness probe follows.
 */
export async function validateSpec(
  path: string, content: string, timeoutMs = 10_000,
): Promise<ValidateResult | null> {
  const kind = specKind(path);
  if (!kind) return null;

  const args = ["-m", "compass.orchestrator.validate", "--kind", kind, "--file", "-"];
  if (kind === "table") {
    const t = TABLE_SPECS[path];
    args.push("--section", t.section, "--columns", t.columns.join(","));
  }

  return new Promise((res) => {
    let out = "", err = "", settled = false;
    const finish = (v: ValidateResult) => { if (!settled) { settled = true; res(v); } };
    const unusable = (why: string): ValidateResult =>
      kind === "workflow"
        ? { kind, ok: false, has_dispatch_graph: false, steps: [], hitl_count: 0, agents: [], requires_approved: [], warnings: [why] }
        : kind === "agent"
          ? { kind, ok: false, preferred_hosts: [], executor_tools: [], model_tier: null, loads_bet_catalog: false, has_frontmatter: false, warnings: [why] }
          : { kind, ok: false, rows: [], warnings: [why] };

    const child = spawn("python3", args, { cwd: REPO });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(unusable("Validation timed out — could not confirm this file is usable."));
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    child.on("error", (e: Error) => {
      clearTimeout(timer);
      finish(unusable(`Could not run the validator (${e.message}). Is python3 available?`));
    });
    child.on("close", () => {
      clearTimeout(timer);
      try { finish(JSON.parse(out) as ValidateResult); }
      catch { finish(unusable(`Validator produced no usable output. ${err.trim().slice(0, 300)}`)); }
    });

    child.stdin.on("error", () => { /* killed before write completed; the close handler settles */ });
    child.stdin.end(content);
  });
}
