// SCRATCH — not part of the suite. Runs the real planner over the on-disk seed and prints the
// refusals, so the CSVs can be validated without a database or a dev server. Delete after use.

import { test } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { planImport, type Bundle, type Existing } from "./plan";
import { readShippedDocTree } from "../doctree";

const SEED = join(process.cwd(), "..", "compass", "seed");
const FILES: Record<keyof Bundle, string> = {
  workstreams: "workstreams.csv",
  phases: "phases.csv",
  ticketBriefs: "ticket-briefs.csv",
  roles: "roles.csv",
  workflows: "workflows.csv",
  steps: "workflow-steps.csv",
  criteria: "criteria.csv",
};

test("plan the on-disk seed", () => {
  const bundle: Bundle = {};
  for (const [k, f] of Object.entries(FILES) as [keyof Bundle, string][]) {
    const p = join(SEED, f);
    if (existsSync(p)) bundle[k] = readFileSync(p, "utf-8");
  }

  const agentsDir = join(process.cwd(), "..", "compass", "agents");
  const agents = existsSync(agentsDir)
    ? readdirSync(agentsDir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3))
    : [];

  // An empty database, plus the documents the shipped tree declares — which is what
  // `readExisting` falls back to on a fresh engagement.
  const existing: Existing = {
    workstreams: [], roles: [], agents, phases: [], ticketBriefs: [],
    documents: readShippedDocTree().filter((n) => n.kind !== "folder").map((n) => n.path),
    workflows: [],
  };

  const result = planImport(bundle, existing);

  if (result.ok) {
    console.log(`\nOK — ${result.summary}\n`);
    for (const w of result.plan.workflows) {
      console.log(`  ${w.action.padEnd(12)} ${w.row.code}  (${w.steps.length} steps, ${w.criteria.length} criteria)`);
    }
    return;
  }

  console.log(`\n${result.problems.length} refusal(s):\n`);
  for (const p of result.problems) {
    console.log(`  ${p.file}${p.row === null ? "" : `:${p.row}`}`);
    console.log(`     ${p.message}`);
    console.log(`     → ${p.fix}\n`);
  }
});
