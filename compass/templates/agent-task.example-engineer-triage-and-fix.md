<!-- WORKED EXAMPLE #2 (the stress test) — engineer.triage-and-fix from the live
     compass/agents/engineer.md, re-cut into agent-task.md. Shows the gate vocabulary this
     reactive, code-reproducing task forced (see stress-test notes). -->
### Task: triage-and-fix
```gates
role:   engineer
host:   claude                          # tool-capable: reads + RUNS the real code (executor_tools, #87)
reads:  [ticket@tickets, code@file, ⟨bet-linked⟩ brief@docs, ⟨bet-linked⟩ bet-arch@docs]
writes: [regression-test@file→scm, fix@file→scm, triage-summary@scm, pr@scm]
pre:    trigger.present && host.tool_capable      # a bug report / repro path + a host that can read+run code
post:   reproduced && regression-test.reproduces-symptom && fix.proportional && ci.green && committed-pushed && classification.stated && !self-reviewed
```
**Work** (the triage-and-fix methodology):
1. **Triage from the code, not the user** — reproduce by reading+running the source; classify severity P0–P3 + defect-vs-enhancement + dedupe. `[refuse-escalate]` refined: ask the human ONLY for what code can't reveal (prod values/state); if still irreproducible → **HALT** with a precise ask, don't fix blind.
2. **Wrong-value bugs need the VALUE** — capture observed · source-of-truth · delta; enumerate + eliminate candidate causes (stale-over-time · wrong-field · wrong-calc); never anchor on a true-but-unrelated defect.
3. **Failing regression test FIRST** (`test: reproduce <bug>`) — must reproduce the user's *symptom*, not your new mechanism (self-confirming ⇒ fails this gate).
4. **Minimum fix** (`fix: …`) — proportional; size ≫ symptom = wrong-layer smell → STOP + re-diagnose.
5–8. Run all local checks + `[mechanical-output-verification]`; `[per-surface-vertical-test]` flag if a data surface is touched; pre-PR contract sweep.
9. **Commit + push** — the orchestrator runs CI-parity + opens the PR on green (never self-open); `REFUSE:` if delivery is blocked.
10. **State CLASSIFICATION** (defect | enhancement) in the triage summary → the orchestrator projects the fix record to Jira (you never write it).

**Handoffs:** upstream `/triage route` | `/fix <arg>` · downstream `automation.write-e2e-tests` · `reviewer.review-pr` → `engineer.respond-to-review`

<!-- ── STRESS-TEST NOTES — new gate-vocabulary this task forced ──────────────────
  · pre references `host.tool_capable` — a HOST-CAPABILITY predicate, not an artifact status.
    → the gate object set needs `host.*` (and `run.*` for orchestrator-owned writes),
      beyond {epic, story, bet, pr, ci}. Add to the vocab in workflow.md.
  · post has JUDGMENT predicates — `regression-test.reproduces-symptom`, `fix.proportional` —
    expressible, but a reviewer/human EVALUATES them (recorded-judgment), unlike mechanical
    `ci.green` / `blockers == 0`. This is the two-kinds-of-gate split, at the task level.
  · Regression-test-BEFORE-fix is an ORDER constraint that stays in Work (prose); the `post`
    asserts the OUTCOME (test reproduces the symptom). Correct split — gates are outcomes,
    not procedures.
──────────────────────────────────────────────────────────────────────────────── -->
