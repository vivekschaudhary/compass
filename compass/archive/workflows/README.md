# Archived workflow designs — NOT executed

These are the framework's v1 dispatch graphs, kept as design history.

**Nothing here runs.** The orchestrator builds its steps from the published `workflow_step` rows in the
database, loaded from `compass/seed/*.csv`. No check compares these files to the seed, so they can be
out of date, and some are: `build.md` has 8 steps where the database has 5, and the extra ones (the
merge constraints, the post-merge tech-writer finalization) exist only here.

Why keep them: 19 of these 32 workflows (`fix`, `triage`, `ops`, `release`, `plan`, `status`, `scan`,
and others) have no database row. These files are the only record of how they were meant to work.

If you are an agent reading this repo to learn what runs: read `compass/seed/workflows.csv` and
`compass/seed/workflow-steps.csv`, not this folder. To bring one of these workflows to life, add its
rows to the seed and import them.
