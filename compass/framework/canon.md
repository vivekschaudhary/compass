# Canon — the patterns Compass is built from

Short-form vocabulary. A workflow or agent file writes `[refuse-escalate]`; this is where that
resolves. Each entry is the **rule**, and its anti-pattern where it has one.

What this file deliberately does not carry: codification accounting ("three instances at
codification…"), catalogue counts ("7 shapes / 19 patterns"), or version archaeology. Those made
canon a ledger of its own history, they cited records that no longer exist, and a count written into
the file is the exact drift `[pre-push-grep-discipline]` exists to catch. The rule is the useful
part; the history is in git.

**`compass/framework/mvp-brd.md` describes what is being built.** Canon describes how. Where the two
touch — the tracker holding status, reviews as rows — the BRD is the decision and canon is the
generalisation.

---

## Compass-original patterns

**Building on a system of record**

### status-of-record-writes-first
**Status-of-record writes first.** When two systems hold the same fact, name which one is the record,
write **there** first, and record locally only if that write took. A local write followed by a
best-effort push leaves the two disagreeing whenever the push fails — and the wrong answer is the one
people look at. Distinguish "nothing to write" (no ticket, no tracker configured) from "the record
refused": the first proceeds, the second blocks. **Anti-pattern: `local-first-then-notify`.**

### cache-not-copy
**A cache is fine; a copy is not.** Data mirrored from a system of record is **derived and
disposable** — droppable and refetchable at any moment, never written to, never the answer to a
question the record could answer directly. Anything that survives a cache flush is a copy, and a
copy drifts. **Anti-pattern: `just-denormalise-a-few-fields`** — the rollup needs the record on every
page load, someone caches "a few" columns, and six months later there is a second, subtly different
truth.

### read-before-overwrite
**Read a shared surface immediately before overwriting it.** An artifact published somewhere people
can edit will be edited. Fetch it before every write and fold any difference in as **input** to the
next draft — never take it as the new base, which means parsing a foreign format back into your own
structure and re-anchoring anything that pointed into it. Trigger on the write, not on the edit
session: acceptance can publish with no revision at all.

**Making invalid states impossible**

### make-it-unrepresentable
**Constrain the representation rather than validating the result.** Where a structure can be written
wrongly, prefer a form in which the wrong version cannot be expressed. Dependencies that may only
point backwards make cycles unrepresentable rather than detectable — no cycle detection anywhere, and
a valid topological order for free. This matters more when an **agent** authors the structure: it
cannot draft an invalid artifact in a dimension the format forecloses.

### the-promise-is-the-criterion
**A unit of work is measured by what it declared, not by a parallel list.** If a row names what it
produces and who accepts it, that *is* the gate — nobody authors it, so nobody can author it
vacuously. Hand-written criteria survive only where there is nothing produced and nobody accepting,
just a probe. **Anti-pattern: `vacuous-criterion`** — a rule requiring "at least one criterion" is
satisfied by *"Done when: the team is aligned."*

### fail-loud-not-silent
**Default a failure's direction toward a loud halt.** A swallowed failure — a silent pass, a NULL
that reads as "nothing wrong", a default that fills in for a missing answer — is worse than a crash,
because it looks identical to success. Aggregates over zero rows are the classic case: `string_agg`
returns NULL, the guard sees no blockers, and the gate passes because there was nothing to check.

### mechanical-output-verification
**Inspect the output, not the exit code.** Where a step builds, deploys, or discovers, the
postcondition examines the produced artifact or the running system. Source intent and build output
diverge silently; a process can succeed and produce the wrong thing.

### done-by-outcome-not-activity
**Done is a demonstrated outcome.** Every work item declares an observable acceptance criterion up
front — *"Done when: &lt;observable&gt;"* — and is done only when that is demonstrated, not when the
activity that was supposed to produce it has finished.

**Where acceptance happens**

### ceremony-is-the-gate
**Acceptance lands at the meeting the team already holds.** Sprint planning accepts the sprint plan;
refinement accepts the stories; demo accepts the work; retro accepts the amendments. No new ritual,
no approval step someone must remember to visit, and the value shows up in the unit people feel — the
meeting got shorter. **Anti-pattern: `an-approval-screen-nobody-opens`.**

### trust-the-human-keep-the-trail
**Attributed human judgment is the standard; do not try to measure quality mechanically.** Structural
checks are satisfiable by whatever generated the artifact — if the drafting agent knows the standard,
everything it produces meets the standard and the tick attests to nothing. Grounding checks catch
sloppiness, never wrongness. Keep the revision trail as a **record, not a gate**: it answers "what
did we know then", it does not decide anything.

### user-as-load-bearing-oversight
**The human is inside the discipline loop, not observing it.** Where mechanical checks produce
wrong-shaped output they cannot see, the user catches it and the agent course-corrects. Treat a
correction as first-class signal — the user has context the agent does not.

### refuse-escalate
**Refuse and escalate rather than widen an upstream decision in place.** When work would silently
broaden something an earlier artifact owns — the stack, the data model, the scope — stop and hand it
back to whoever owns that decision. No silent widening, and no silent skips: a declined step is
logged with its rationale.

### cite-or-mark-na
**Every named category produces a citation or an explicit `n/a — <reason>`.** Where a deliverable
depends on consulting N kinds of evidence, an empty cell is not an answer. Unjustified blanks are the
failure this prevents.

**How work is described**

### soft-spec-hardening
**Anywhere an agent has interpretive room, it will exercise judgment that diverges from intent.**
Constraints written as "ensure", "consider", "obviously" get rationalised away under load. The fix
has three parts: explicit imperative with the failure spelled out · a mechanical verification gate
that blocks and cannot be hand-waved · a **named anti-pattern** so the next reader inherits the
vocabulary.

### workflow-as-dispatch-graph
**A workflow file is a thin ordered dispatch contract** — rows naming who does what, what each reads
and produces, and what it depends on. Methodology lives in the agent files. **Anti-pattern:
`embedded-methodology`** — a workflow owning both the sequence and the method means two sources of
truth per task and nothing a machine can walk.

### agent-as-surface-independent-unit
**The unit of assignment is the agent file**: self-sufficient and surface-independent — identity,
principles, tools, task definitions, refusal rules, handoffs. Paste it into any host's system-prompt
slot and it works. The host is a runtime, not a role authority.

### conditional-dispatch
**A step may route rather than fall through.** A routing gate selects what happens next — an inline
step, a hand-off to another workflow, or a stop — instead of always advancing to the next row.

### agent-handoff
**Name every piece of a hand-off so the human is not the bridge:** trigger artifact · trigger event ·
context window · output medium · loop signal.

### role-boundary
**Mark where work changes hands.** A transition between roles is explicit in the artifact, so a
reader — and a checker — can see it rather than infer it.

### elicitation-with-options
**When surfacing a real choice, offer three widely-used options plus "Other (specify)".** An open
question invites invention; a closed one hides the escape valve.

### agent-file-compression
**Agent files fit the smallest host's instruction cap** (~8000 chars for OpenAI Custom GPT
Instructions). Past it they truncate silently and the tail — postconditions, refusal rules — is what
is lost. Checked by `compass/scripts/check-agent-cap.py`.

**Keeping artifacts honest**

### cross-artifact-sweep-on-contract-shift
**A change to a load-bearing fact sweeps every artifact that stated it, in the same commit.** Contract
surfaces, counts, version strings, renames, citations. Variants: **intra-file** (a prose summary
contradicting the structured body of the same file) · **inter-file** · **external-source** (a citation
to third-party docs that moved).

### pre-push-grep-discipline
**Before committing an amendment to a load-bearing concept, grep for the old phrasing.** The
instrument is `compass/scripts/pre-push-consistency-check.py <old phrasing>`. This is the cheap
mechanism that satisfies `[cross-artifact-sweep-on-contract-shift]`. **Anti-pattern:
`grep-class-work-to-reviewer`** — sending textual drift to a reviewer wastes the review on work a
grep does in seconds.

### freshness-check
**A doc describing something external carries `last_verified`, `freshness_window_days` and
`external_source`, and whatever depends on it refuses when the window has lapsed.** External formats
and APIs move; a doc about them is a claim with a shelf life.

### capability-by-default-not-flag
**A capability the system is meant to have is on, not behind a flag nobody sets.** A default-off
capability is indistinguishable from an absent one.

**Testing and shipping**

### test-alongside-implementation
**A new write path, parsing behaviour or capability ships its tests in the same commit** — creation,
the new behaviour, and the edge and failure cases. **Anti-pattern: `tests-later`.**

### per-surface-vertical-test
**Every data surface has at least one test traversing the real vertical on a prod-like build** —
authenticate as a real user, hit the authorization-enforced query, assert on what comes back. Unit
tests over mocked clients do not see an authorization rule that is wrong.

### reproduce-before-diagnose
**Reproduce the failure before explaining it.** A diagnosis built on a story about the failure rather
than the failure itself fixes the story.

### declare-not-implement
**When an integration with an external tool or service is needed, declare the pattern, the registry
and the manual fallback rather than writing the integration.** The consumer wires it; the framework
holds the contract.

**How the framework changes**

### consumer-as-primary-signal
**Improvements originate from real consumer friction** — production failures, migration pain,
review-loop waste, abandonment — and only secondarily from reasoning about the framework in the
abstract.

### hard-line-declaration
**A commitment to ship something later carries a visible counter and a named consequence** at the
point it slips. Otherwise deferral is free and repeats.

### discipline-as-muscle-memory
**Scaffolding earns removal.** When a discipline has fired on time for several consecutive instances,
the external counters and reminders that established it can come down — the practice, not the
scaffolding, is the thing.

### fractal-retro
**Retros are altitude-independent.** The same shape applies at role, workflow, bet, project and
framework altitude, consolidating bottom-up. Framework-altitude retros read GitHub closed issues and
merged PRs.

### agent-agnostic-role-assignment
**Which model plays a role is configuration, not prose.** Declared once against a registry of
runtimes, not hardcoded across documents.

### actionability-before-trust
**Surface the thing a human must act on where they will see it**, rather than reporting it somewhere
they must remember to look. Observability without an action route is decoration.

### sprint-0-materializes-refinable-defaults
**Foundation work produces defaults a team can refine, not blanks it must fill.** A draft that is
wrong in a specific way is more useful than a template that is empty in every way.

---

## External references

Cited by workflows in their framework-grounding sections.

| slug | source | contribution |
| ---- | ------ | ------------ |
| `working-backwards` | Amazon, ~2004; Bryar & Carr (2021) | start from the customer outcome and derive the product backwards |
| `lean-mvp` | Eric Ries, *The Lean Startup* (2011) | features are falsifiable hypotheses; validate the smallest experiment that produces signal |
| `continuous-discovery` | Teresa Torres (2021) | weekly customer contact and opportunity-solution trees as a cadence, not a quarterly round |
| `shape-up` | Ryan Singer / Basecamp (2019) | appetite-bounded cycles; work is shaped before it is committed; a bet table replaces a backlog |
| `well-architected` | AWS (2015, sustainability 2021) | six pillars — reliability · security · performance · cost · operational excellence · sustainability — as scoring axes for an architecture decision |
| `evolutionary-architecture` | Ford, Parsons, Kua (2017/2022) | fitness functions as continuous, objective architectural tests |
| `pyramid-principle` | Barbara Minto (1973+) | conclusion first, then support, then evidence — the inverse of how thinking happens, but how reading happens |
| `amazon-6-page` | Amazon, ~2004 | a narrative memo read in silence; forces the writer to do the synthesis the reader would otherwise do live |
| `stripe-2-page` | Stripe, ~2014+ | a fixed page budget is a forcing function, and the budget itself signals seriousness |

---

## Cited but not defined here

These slugs appear in agent and workflow files and have no entry. They are real vocabulary that was
never written down, not typos — recorded so the gap is visible rather than discovered one citation at
a time:

`architecture-grounded-in-code` · `right-size-the-path-to-the-work` · `functional-story` ·
`host-preference-validation` · `no-padded-status` · `derive-from-state` · `failure-mode-first` ·
`task-ownership-locality` · `hold-positions-in-disputes` · `ai-collapses-org-tiering` ·
`agent-asks-structured-questions` · `reviewer-scopes-to-diff` · `living-not-snapshot` ·
`independent-review-as-signal-source` · `orchestrator-as-residual-shrinker` ·
`freshness-window-too-tight` · `rsc-prop-serialization` · `server-action-file-export-purity`

Each is defined inline wherever it is cited. Promote one here when it is cited from more than one
place and the inline definitions start to differ.
