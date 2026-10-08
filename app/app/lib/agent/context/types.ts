import type { ResolvedTemplate } from "../../data/templates";

/**
 * How much of an ask reaches the human at once, and how many rounds it gets.
 *
 * An agent told to "ask everything at once" produced thirteen questions on the first task of a real
 * engagement. Every one was reasonable and the whole was a form to fill in — and several of the
 * thirteen were things the answer to the first three would have settled. The conversation is
 * already replayed on every run, so a later round is asked WITH the earlier answers in hand: the
 * cap is what makes that machinery do something.
 *
 * Bounded in the other direction too. Each round is a model run of minutes plus a human waiting on
 * it, so an unbounded interview is its own way of never producing the deliverable.
 *
 * Here rather than in `run.ts` because the prompt states both numbers to the agent and `run.ts`
 * enforces them. Two copies is how a checker ends up carrying the literal it is policing.
 */
export const ASK_BATCH = 3;
export const ASK_ROUNDS_MAX = 4;

export type PinnedInput = {
  path: string;
  title: string | null;
  version: string | null;
  /** Null when the document has never been drafted — the honest empty. */
  body: string | null;
};

export type AgentContext = {
  taskId: string;
  engagementId: string;
  taskTitle: string;
  taskSubtitle: string;
  roleCode: string;
  agentFile: string | null;
  /**
   * The document path this step produces — the PATH, never the decorated `produces` string.
   *
   * A step may name where its deliverable goes (`02-scope/deliverables@tickets`). That suffix is
   * routing, and it must not travel: `loadPriorDraft` looks a document up by path, the prompt tells
   * the agent what it is producing, and a criterion's `subject_ref` names the same bare path. Left
   * decorated, the prior draft would silently never be found — the agent would rewrite from scratch
   * every run and nothing would say why.
   */
  produces: string | null;
  /**
   * The path this step declares when it names a subject the run does not have — `…/{epic}` on a
   * run opened with no epic. Null whenever `produces` resolved, which is every ordinary step.
   *
   * Carried separately because "this step produces nothing" and "this step's document has nowhere
   * to go" are different failures with the same symptom (`produces === null`), and a halt that
   * reports the wrong one sends whoever reads it to the wrong file.
   */
  unresolvedProduces: string | null;
  /**
   * What panel the job page mounts — see `workflow_step.renders` (migration `step_renders`).
   * `"none"` when the row declares none, which is also what a step imported before this column
   * existed gets: no panel, exactly what it rendered before.
   */
  renders: "doc" | "code" | "doc-review" | "code-review" | "none";
  /**
   * `doc-review`/`code-review` ONLY: the document (or change) this row reviews, resolved from the
   * single `depends_on` row's own `produces`. Null for every other row.
   *
   * DELIBERATELY SEPARATE from `produces` above, not a repurposing of it. `produces` is what
   * `runAgent` files to — `if (!ctx.produces) halt` is the guard that stops a row with nothing to
   * author from filing anything, and a review row's own `produces` IS empty by construction
   * (enforced at import). Pointing `produces` at the reviewed document instead would pass that
   * guard and let running the agent on a REVIEW task silently overwrite the document under
   * review, filed as if the reviewer authored it. `page.tsx` reads `reviewPath` for display only
   * (`draftOf`, `DraftPanel`'s `path`) and `runAgent` never looks at it.
   */
  reviewPath: string | null;
  /**
   * The run's own subject (`subjectOfRun`), surfaced here rather than re-read: a `scaffold` row has
   * no per-subject path to resolve `produces` through (its deliverable is a pull request, not a
   * document), so this is the only place the run's repo key reaches the prompt.
   */
  subject: { ref: string | null; key: string | null } | null;
  /** The registered repo the subject names, when `output === "scaffold"`. Null otherwise. */
  repoName: string | null;
  /**
   * Resolved once here from `actor.capabilities`, not re-derived wherever it is needed — read by
   * `systemPrompt` (to tell the model it actually has this, rather than leaving it to notice the
   * gap between its own agent file's `required_tools: [... web_search ...]` and what it was
   * actually given) and by `run.ts` (to ask the host for it). Most agent files declare `web_search`
   * required; almost none of them had it — this is that gap closing, one role's capability row at
   * a time via `roles.csv`, not a blanket flip for everyone.
   */
  hasWebSearch: boolean;
  /**
   * Where it goes. `docs` publishes a page; `tickets` creates issues on the board; `scm` means the
   * deliverable is a branch and a pull request, and the record belongs on the story in the tracker
   * rather than in a document.
   */
  destination: "docs" | "tickets" | "scm" | null;
  /**
   * What KIND of thing this step makes — `roster`, `backlog`, `sprint`, or null for an ordinary
   * document. What `toolsFor` keys on. It used to key on `produces`, and a path the author renames
   * is not a safe key for behaviour: the rename silently took the tool away and nothing said so.
   */
  output: string | null;
  inputs: PinnedInput[];
  doneCriteria: string[];
  /** What workflows this engagement can actually run. Without it the agent guesses. */
  inventory: WorkflowSummary[];
  /**
   * The other rows of THIS run — what each is for, who holds it, and whether it comes after.
   *
   * `inventory` lists the engagement's WORKFLOWS, which is a different thing: an agent could see
   * that `sprint-0` exists with fourteen steps and not that row 4 is "Staffing plan and resources",
   * owned by the delivery manager. So `file-sow` — which reads nothing and starts from a blank page
   * — asked the human for the team, and `propose-staffing` asked again four rows later.
   *
   * This is the PLAN the agent is part of, not other agents' conversations. Turns stay task-scoped
   * and documents remain the only thing that crosses a row boundary; sharing chatter would cost
   * provenance, the pinned version, and a bounded prompt, for a problem this solves more cheaply.
   */
  phaseRows: PhaseRow[];
  /**
   * The shape the deliverable must arrive in, resolved for this engagement.
   *
   * Null in two very different cases, which is why `templateName` travels beside it: the step
   * declared no template at all (free-form, and most rows are), or it declared one that resolved to
   * nothing. `runAgent` halts on the second and proceeds on the first — a model left to invent its
   * own structure produces a document that looks finished and is not the deliverable the process
   * asked for, and nothing downstream can tell the difference.
   */
  template: ResolvedTemplate | null;
  /** What the step asked for by name, whether or not it resolved. */
  templateName: string | null;
  /** What it produced last time, and what a reviewer said about it. Null on the first run. */
  priorDraft: { version: string; sections: { heading: string; body: string }[] } | null;
  rejections: { criterion: string; reason: string; by: string }[];
  /** Set only on a step that plans a sprint. Null everywhere else. */
  sprint: SprintContext | null;
};

/**
 * What a sprint plan needs that no pinned document can supply.
 *
 * `committable` is asked of the TRACKER, not of Compass. Which stories are already in a sprint is
 * a fact about the board, and a story somebody moved by hand there must not be offered again — the
 * whole reason this feature keeps no sprint table of its own.
 *
 * `reachedTracker` is the honest empty, and it is why `committable` being `[]` is not enough on its
 * own. An agent told "nothing is committed" when the truth is "nobody could look" will happily
 * re-commit a sprint's worth of work that is already in flight.
 */
export type SprintContext = {
  /** Which sprint this is. */
  number: number;
  /** Stories on the board that are not in any earlier sprint. */
  committable: { ref: string; ticketKey: string | null; title: string; epic: string | null }[];
  /** Who is on this engagement, by role — what capacity actually means here. */
  roster: { role: string; holders: string[] }[];
  /** False when the tracker could not be reached, so `committable` is unknown rather than empty. */
  reachedTracker: boolean;
};

export type PhaseRow = {
  ord: number;
  title: string;
  role: string;
  produces: string | null;
  /** After this task's own row. What a later row produces is that row's to gather, not this one's. */
  later: boolean;
};

export type WorkflowSummary = {
  code: string; label: string; workstream: string | null;
  ownerRole: string | null; stepCount: number;
};
