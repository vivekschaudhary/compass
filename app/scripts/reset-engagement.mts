// Clear an engagement's work, keeping the engagement.
//
//   node --experimental-strip-types --env-file=.env.local scripts/reset-engagement.mts
//   node --experimental-strip-types --env-file=.env.local scripts/reset-engagement.mts <engagement>
//   node --experimental-strip-types --env-file=.env.local scripts/reset-engagement.mts <engagement> --apply
//
// With no id it reports on EVERY engagement. `--apply` is what writes; without it nothing is
// touched, exactly as `repoint-runs.mts` behaves, and for the same reason — the useful output of a
// destructive tool is the list of what it would destroy.
//
// WHY THIS EXISTS AND WHEN TO RUN IT: see `app/lib/data/reset.ts`. The short version is that it runs
// BEFORE an import that shrinks a workflow, never after, because `syncSteps` cannot delete a step a
// live task still points at and `applyPlan` has no transaction to roll back when it fails.
//
// It clears COMPASS'S SIDE ONLY. Pages already published to Confluence or Teams, and issues already
// created in Jira, stay where they are — the report says how many, so that is a decision rather
// than a surprise.

import { describeReset } from "../app/lib/data/reset.ts";
import { engagementsToReset, resetEngagement } from "../app/lib/data/reset-apply.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args.find((a) => !a.startsWith("--")) ?? null;

// THE SAME CODE THE ROUTE RUNS. Reading the engagement, planning the deletes and carrying them out
// all live in `reset-apply.ts` now that `POST /api/cleanup` calls them too — two copies of "clear
// an engagement" is how a CLI and a route come to mean different things by the word.
const found = await engagementsToReset(only);
if (!found.ok) { console.error(`\u2717 ${found.error}`); process.exit(1); }
if (!found.targets.length) { console.log("No engagements."); process.exit(0); }

let refused = 0, cleared = 0;

for (const target of found.targets) {
  console.log(`\n${target.id}  \u2014  ${target.name ?? ""}`);

  let result;
  try {
    result = await resetEngagement(target.id, target.name, { apply });
  } catch (e) {
    console.error(`\u2717 ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  if (!result.ok) {
    for (const r of result.refusals) console.log(`  \u00b7 ${r.message}\n    \u2192 ${r.fix}`);
    refused++;
    continue;
  }

  for (const line of describeReset(result.plan)) console.log(line);
  if (result.plan.publishedElsewhere > 0) {
    console.log(
      `\n  NOTE  ${result.plan.publishedElsewhere} document(s) are published to the doc store. ` +
      `Those pages are NOT deleted \u2014 this clears Compass's side only.`,
    );
  }

  cleared++;
  if (result.cleared) console.log("  \u2713 cleared");
}

console.log(
  `\n${found.targets.length} engagement(s): ${cleared} ${apply ? "cleared" : "to clear"}` +
  (refused ? ` \u00b7 ${refused} refused` : "") +
  (apply ? "" : "\n\nReport only. Re-run with --apply to write."),
);
