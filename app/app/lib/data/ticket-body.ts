// What a ticket SAYS, as opposed to that a ticket exists.
//
// `tracker.ts` puts the board in place — an epic per phase, a story per row, the key stored so
// Compass and Jira name the same thing. It wrote the text too, and the text was a literal:
//
//     "Worked in Compass. This ticket mirrors its state."
//
// Every story on every engagement, identical. The board was structurally correct and said nothing:
// a client PM opening CT-16 learned that a tool they have never heard of is tracking something. The
// standard for what a ticket carries is already written down — `## What my tickets and deliverables
// carry` in `compass/agents/delivery-manager.md` and `product-manager.md` — and nothing in the
// mirror path had ever read it, because nothing in the mirror path called a model at all.
//
// So this module is the missing half: the ROLE that owns a ticket composes its body, from its own
// markdown and from the record, and the composed text is written over the placeholder.
//
// AFTER creation, not during. Opening a phase must not wait on a model or fail because one was
// unreachable — `tracker.ts` is deliberately "never fatal while work is in flight" and that stays
// true. It also makes this the repair path for the one-liners already on the board.
//
// LEVEL-FIRST, NOT JIRA-TYPE-FIRST. This used to take a Jira issue type (Epic/Story/Task/Bug) as
// its framing concept — four generic buckets, identical across every org, that thought in Jira's
// vocabulary rather than Compass's own. Compass's actual hierarchy is three levels: `epic` (the
// phase/bet as a whole), `story` (one deliverable within it), `subtask` (one step inside that
// deliverable's own workflow — see `mirrorNested`). Conflating `subtask` with the old generic
// "Task" brief is exactly how a sub-task like "Accept the feature" ended up saying nothing more
// than `${title}.\n\n_Part of ${parent}._` forever: nothing ever gave it ground rules of its own,
// let alone ones demanding it read as EXECUTION — what the role holding it is doing right now,
// not a restatement of the story it sits under.
//
// THE GROUND RULES ARE DATA, NOT A CONSTANT. `ticket_brief` (see its own migration comment) holds
// one brief per level, org-default with an optional engagement override — same two-tier precedence
// `phase`/`workstream` already use. A client-specific org can rewrite what a sub-task says without
// a deploy; this file only resolves it and hands it to the model.
//
// ONE MODEL CALL PER ROLE, IN PARALLEL — not one after another. `composeTicketBodies` batches by
// role because one system prompt is one role's markdown; a phase with six roles used to mean six
// sequential model calls before anything was on the board, and a nested run adds a seventh path
// (sub-tasks) with the same cost. Nothing about one role's batch depends on another's answer, so
// they run concurrently — bounded, not unbounded, because both the model host and Jira have real
// rate limits and a phase's role count is not.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { resolveJira, updateIssue, type JiraCreds } from "../jira";
import { agentMarkdown, doneCriteriaFor, loadDocumentText } from "../agent/context";
import { selectHost, MODEL } from "../agent/hosts/select";
import { emit, orgIdFor } from "./events";
import { sortByStep } from "./steps";

/** Compass's own three-level hierarchy — never a Jira issue type. `Bug` deliberately has no level
 *  here: nothing live composes one today (triage/fix is a different flow, with its own ground
 *  rules when it exists), and squeezing it into this hierarchy would misdescribe it. */
export type TicketLevel = "epic" | "story" | "subtask";

/**
 * How many role batches compose at once — see the file header. Not a config value: this is a
 * concurrency cap, not a business rule an org would ever want to override, so it stays a constant
 * the same way `ASK_BATCH` does in `context.ts`.
 */
const COMPOSE_CONCURRENCY = 3;

/**
 * Run `fn` over `items`, at most `limit` in flight at once — a worker pool, not a batch-and-wait:
 * the moment one item finishes, the next starts, so a slow item never idles a fast one behind it.
 *
 * Pure and dependency-free on purpose. `p-limit` is already in the lockfile, but only as some
 * other package's transitive dependency — importing it directly here would be relying on a version
 * nothing in `package.json` actually pins, exactly the kind of drift `AGENTS.md`'s lockfile rule
 * exists to catch. Four lines is cheaper than a real dependency for what this needs.
 */
async function mapWithConcurrency<T, R>(
  items: T[], limit: number, fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * One level's ground rules, engagement override winning over the org default — same precedence
 * `templateFor` and every other two-tier catalog in this app resolve with.
 *
 * Null means genuinely unconfigured (the seed was never imported for this org), and callers must
 * treat that as a real gap — see `composeTicketBody`'s `no-brief` handling — never as license to
 * fall back to invented text. The catalog existing is the whole point of moving this out of code.
 */
export async function ticketBriefFor(
  orgId: string, engagementId: string | null, level: TicketLevel,
): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  if (engagementId) {
    const { data } = await sb.from("ticket_brief").select("brief")
      .eq("org_id", orgId).eq("engagement_id", engagementId).eq("code", level).eq("enabled", true)
      .maybeSingle();
    if (data?.brief) return data.brief as string;
  }

  const { data } = await sb.from("ticket_brief").select("brief")
    .eq("org_id", orgId).is("engagement_id", null).eq("code", level).eq("enabled", true)
    .maybeSingle();
  return (data?.brief as string | undefined) ?? null;
}

/** What a role is asked to write about, assembled from the record by the caller. */
export type TicketRequest = {
  /**
   * The handle the model must echo back — a task id, a run id, anything the caller can look up.
   *
   * A model that returns bodies in an order, and a caller that zips them by index, writes one
   * ticket's body onto another ticket the first time the model drops an item. So the mapping is
   * explicit and an unrecognised `ref` is dropped rather than guessed at.
   */
  ref: string;
  level: TicketLevel;
  /** Whose markdown governs the writing. Its agent file must exist, or nothing is composed. */
  roleCode: string;
  /** The Jira key to write to. Absent means compose but do not patch — used by tests and previews. */
  key?: string | null;
  /** What the ticket is called now. The model may improve it; it may not invent a different scope. */
  summary: string;
  /** Row facts, label → value. Whatever the caller genuinely holds; nulls are dropped, not guessed. */
  facts: Record<string, string | null | undefined>;
  /** Appended verbatim by CODE. The model is told they exist and told not to write its own. */
  doneCriteria: string[];
};

export type ComposedBody = { ref: string; key: string | null; summary: string; description: string };

/**
 * Why the board does not carry what it should, when it does not — the same discriminator
 * `Mirrored.reason` makes, for the same reason. "Nothing was owed" and "a model refused" are
 * different facts and must not both arrive as a string of English.
 */
export type ComposeReason =
  | "no-supabase" | "no-tracker" | "no-run" | "nothing-to-compose"
  | "no-agent-file" | "no-brief" | "no-host" | "model-refused" | "model-silent" | "patch-refused";

export type Composed = {
  /** Tickets whose body was composed AND written. */
  written: ComposedBody[];
  /** How many were owed a body. `written.length` alone cannot say whether three is all of them. */
  expected: number;
  problems: string[];
  reason?: ComposeReason;
};

/** Did the board end up short of what it was owed? Pure, and the counterpart to `mirrorIncomplete`. */
export function composeIncomplete(c: Composed): boolean {
  if (c.reason === "no-tracker" || c.reason === "no-supabase" || c.reason === "nothing-to-compose") return false;
  return c.written.length < c.expected;
}

/**
 * The tool the composer forces.
 *
 * Structured for the same reason `run.ts` uses tools rather than prose: the result becomes Jira
 * field values. Parsing headings out of free text would be guessing at the moment precision matters,
 * and a body that half-parsed would be written to a client's board.
 */
const BODY_TOOL = {
  name: "ticket_bodies",
  description:
    "Return the composed body for every ticket you were given, and nothing else. One entry per " +
    "`ref`, echoing the `ref` exactly as given.",
  input_schema: {
    type: "object" as const,
    properties: {
      tickets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ref: { type: "string", description: "Exactly the ref you were given for this ticket." },
            summary: {
              type: "string",
              description:
                "The ticket title, in the product's vocabulary. Keep the scope you were given — " +
                "sharpen the wording, do not change what the ticket is.",
            },
            description: {
              type: "string",
              description:
                "The body. Markdown: `## ` headings and `- ` bullets render on the board, nothing " +
                "else does. Do not write an acceptance section — it is appended for you.",
            },
          },
          required: ["ref", "summary", "description"],
          additionalProperties: false,
        },
      },
    },
    required: ["tickets"],
    additionalProperties: false,
  },
  strict: true,
};

/** The heading the verbatim criteria go under. One definition — the tests assert against it too. */
export const ACCEPTANCE_HEADING = "## Acceptance";

/**
 * The instruction, on top of the role's own markdown.
 *
 * Says what is being written and what is known, and nothing about how to write it — that is the
 * markdown's job, and repeating it here in weaker words is how the file stops being the standard.
 */
function userPrompt(
  programme: { engagement: string; context: string[] },
  grounding: { path: string; title: string | null; version: string | null; body: string | null }[],
  tickets: TicketRequest[],
  briefs: Map<TicketLevel, string>,
): string {
  const parts: string[] = [];

  parts.push(
    `You are writing the body of ${tickets.length} ticket${tickets.length === 1 ? "" : "s"} for ` +
    `the ${programme.engagement} engagement.`,
  );
  if (programme.context.length) parts.push(programme.context.join("\n"));

  parts.push(
    `\n# What you may draw on\n\n` +
    (grounding.length
      ? `These are the engagement's documents, in full. Every product-specific claim you make must ` +
        `come from them or from a ticket's own facts below. There is nothing else — no market, ` +
        `system, regulation, integration, headcount or date that is not here.`
      : `NOTHING. This engagement has no documents yet. Write what the ticket's own facts support ` +
        `and say plainly what is not yet known and which deliverable will settle it. Do not fill ` +
        `the gap with plausible generalities.`),
  );
  for (const g of grounding) {
    parts.push(
      `\n---\n**${g.title ?? g.path}** (\`${g.path}\`${g.version ? `, ${g.version}` : ""})\n\n` +
      (g.body ?? "_This document is declared but has never been drafted._"),
    );
  }

  parts.push(`\n---\n\n# The tickets`);
  for (const t of tickets) {
    const facts = Object.entries(t.facts)
      .filter(([, v]) => v != null && String(v).trim() !== "")
      .map(([k, v]) => `  - ${k}: ${v}`);
    parts.push(
      `\n## ref \`${t.ref}\` — ${t.level}\n` +
      `- current title: ${t.summary}\n` +
      `- what this level is for: ${briefs.get(t.level)}\n` +
      (facts.length ? `- what the record holds:\n${facts.join("\n")}\n` : `- the record holds nothing else about it\n`) +
      (t.doneCriteria.length
        ? `- ${t.doneCriteria.length} acceptance criteri${t.doneCriteria.length === 1 ? "on is" : "a are"} ` +
          `recorded and will be appended to your body verbatim under "${ACCEPTANCE_HEADING}". Do not ` +
          `restate, paraphrase or add to them.\n`
        : `- no acceptance criteria are recorded; say so rather than inventing some.\n`),
    );
  }

  parts.push(
    `\nReturn one entry per ref through \`ticket_bodies\`. Echo each ref exactly.`,
  );
  return parts.join("\n");
}

/** Criteria appended by code, so they cannot be paraphrased away. */
function withAcceptance(description: string, criteria: string[]): string {
  if (!criteria.length) return description.trim();
  return `${description.trim()}\n\n${ACCEPTANCE_HEADING}\n\n${criteria.map((c) => `- ${c}`).join("\n")}`;
}

/**
 * Compose bodies for one role's tickets — the generic entry point.
 *
 * One turn per ROLE, not one per batch. The system prompt is a single role's markdown, and blending
 * two roles' standards into one prompt would mean neither is the one that governs — the whole point
 * is that the delivery manager writes the epic and the product manager writes the product stories.
 *
 * Composes only. Writing to Jira is the caller's step, so this is testable without a board and so a
 * preview can show a body before anyone commits it.
 */
export async function composeTicketBody(input: {
  engagementId: string;
  orgId: string;
  roleCode: string;
  programme: { engagement: string; context: string[] };
  grounding: Awaited<ReturnType<typeof loadDocumentText>>[];
  tickets: TicketRequest[];
}): Promise<{ bodies: ComposedBody[]; problems: string[]; reason?: ComposeReason }> {
  const { roleCode } = input;
  if (!input.tickets.length) return { bodies: [], problems: [], reason: "nothing-to-compose" };

  // The ground rules ARE data — resolve every level this batch actually needs, once. A level with
  // no brief configured (the seed was never imported for this org) is a real gap, not license to
  // invent text: its tickets are dropped, named, rather than composed with nothing to go on.
  const levels = [...new Set(input.tickets.map((t) => t.level))];
  const briefs = new Map<TicketLevel, string>();
  const problems: string[] = [];
  await Promise.all(levels.map(async (level) => {
    const brief = await ticketBriefFor(input.orgId, input.engagementId, level);
    if (brief) briefs.set(level, brief);
  }));

  const tickets = input.tickets.filter((t) => {
    if (briefs.has(t.level)) return true;
    problems.push(`No ticket brief configured for level '${t.level}' — \`${t.ref}\` left as it was.`);
    return false;
  });
  if (!tickets.length) return { bodies: [], problems, reason: "no-brief" };

  // The role's markdown IS the standard. Absent, there is no standard, and a body written anyway
  // would be the model's own idea of a ticket wearing the role's name.
  const md = await agentMarkdown(input.engagementId, input.orgId, roleCode);
  if (!md) {
    return {
      bodies: [], reason: "no-agent-file",
      problems: [
        ...problems,
        `No agent file for role \`${roleCode}\` — ${tickets.length} ticket(s) left as they are. ` +
        `Its markdown is what defines what a ticket carries; nothing was substituted for it.`,
      ],
    };
  }

  let result;
  try {
    // Through the host seam. NEVER `new Anthropic()` here: routing is the whole reason the seam
    // exists, and an unavailable host halts rather than quietly becoming the metered API.
    const host = selectHost();
    result = await host.dispatch({
      model: MODEL,
      maxTokens: 32000,
      system: md,
      tools: [BODY_TOOL],
      messages: [{ role: "user", content: userPrompt(input.programme, input.grounding, tickets, briefs) }],
    });
  } catch (e) {
    return {
      bodies: [], reason: "no-host",
      problems: [...problems, `Could not reach a model host: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  if (result.stopReason === "refusal") {
    return {
      bodies: [], reason: "model-refused",
      problems: [...problems, `The model declined to write these bodies. ${result.refusalExplanation ?? "No explanation given."}`],
    };
  }

  const call = result.toolCall;
  if (!call || call.name !== BODY_TOOL.name) {
    return {
      bodies: [], reason: "model-silent",
      problems: [
        ...problems,
        `The model answered without using \`${BODY_TOOL.name}\`` +
        (result.text ? `: ${result.text.slice(0, 300)}` : "."),
      ],
    };
  }

  const raw = (call.input as { tickets?: unknown })?.tickets;
  const returned = Array.isArray(raw) ? raw : [];
  const byRef = new Map(tickets.map((t) => [t.ref, t]));
  const bodies: ComposedBody[] = [];
  const seen = new Set<string>();

  for (const entry of returned) {
    const e = entry as { ref?: unknown; summary?: unknown; description?: unknown };
    const ref = String(e?.ref ?? "");
    const want = byRef.get(ref);
    // A ref nobody asked for is dropped, not written. Whatever it is, it is not one of these
    // tickets, and writing it would put invented text on a real board.
    if (!want) { problems.push(`Dropped a body for unknown ref \`${ref || "(empty)"}\`.`); continue; }
    if (seen.has(ref)) { problems.push(`Dropped a duplicate body for \`${ref}\`.`); continue; }
    const description = String(e?.description ?? "").trim();
    if (!description) { problems.push(`Empty body returned for \`${ref}\`; left as it was.`); continue; }
    seen.add(ref);
    bodies.push({
      ref, key: want.key ?? null,
      summary: String(e?.summary ?? "").trim() || want.summary,
      description: withAcceptance(description, want.doneCriteria),
    });
  }

  for (const t of tickets) {
    if (!seen.has(t.ref)) problems.push(`The model returned no body for \`${t.ref}\` (${t.summary}).`);
  }

  return { bodies, problems };
}

/**
 * Put real bodies on a phase's board — the batch caller.
 *
 * Reads the run the same way `mirrorPhase` does, so the two cannot disagree about what a phase
 * contains: the same `sortByStep`, the same task rows, the epic key off `workflow_run.ticket_key`.
 */
export async function composeTicketBodies(
  engagementId: string, runId: string, actorRole: string,
  opts: {
    force?: boolean;
    /** What level THIS run's own tasks are — `story` for a phase's rows (the default), `subtask`
     *  for a nested run's (see `mirrorNested`). The run's own epic-level request, when it has one,
     *  is always `epic` regardless — a nested run never has one (`ticket_key` stays null; see
     *  `mirrorNested`'s own comment), so that branch simply never fires for it. */
    taskLevel?: TicketLevel;
  } = {},
): Promise<Composed> {
  const taskLevel = opts.taskLevel ?? "story";
  const out: Composed = { written: [], expected: 0, problems: [] };
  const sb = supabaseAdmin();
  if (!sb) return { ...out, reason: "no-supabase", problems: ["Supabase is not configured."] };

  const { data: eng } = await sb.from("engagement")
    .select("name, jira_project, atlassian_base_url, atlassian_email, atlassian_api_token")
    .eq("id", engagementId).maybeSingle();
  const creds: JiraCreds | null = eng ? resolveJira(eng) : null;
  // Not an error: an engagement may deliberately run without a tracker, and there is then no body
  // to write anywhere. Composing one would cost a model call to produce text nobody can read.
  if (!creds) return { ...out, reason: "no-tracker" };

  const { data: run } = await sb.from("workflow_run")
    .select("id, ticket_key, ticket_body_at, owner_role_code, workflow(code, label)")
    .eq("id", runId).eq("engagement_id", engagementId).maybeSingle();
  if (!run) return { ...out, reason: "no-run", problems: ["No such run on this engagement."] };
  const wf = Array.isArray(run.workflow) ? run.workflow[0] : run.workflow;

  const { data: rows } = await sb.from("work_task")
    .select("id, title, subtitle, role_code, ticket_key, ticket_body_at, workflow_step_id, workflow_step(ord, produces, reads)")
    .eq("workflow_run_id", runId);
  const tasks = sortByStep(rows ?? []);

  const orgId = await orgIdFor(engagementId);
  if (!orgId) return { ...out, reason: "no-supabase", problems: ["Could not resolve the org."] };

  // Everything these steps read, once. Today that is the SOW; the shape does not change when it
  // is not.
  const paths = [...new Set(tasks.flatMap((t) => stepOf(t)?.reads ?? []))] as string[];
  const grounding: Awaited<ReturnType<typeof loadDocumentText>>[] = [];
  for (const p of paths) grounding.push(await loadDocumentText(engagementId, p));

  const programme = {
    engagement: eng?.name ?? engagementId,
    context: [
      `Workflow: ${wf?.label ?? wf?.code ?? "unnamed"}.`,
      taskLevel === "subtask"
        ? `The parent ticket covers what this row belongs to as a whole; each sub-task below is one ` +
          `step of the work happening inside it — describe the step, not the whole.`
        : `The epic covers the phase as a whole; each story is one deliverable within it.`,
    ],
  };

  // What is owed a body, grouped by the role that owns it.
  const requests: TicketRequest[] = [];
  if (run.ticket_key && (opts.force || !run.ticket_body_at)) {
    requests.push({
      ref: `run:${run.id}`,
      level: "epic",
      // The run's own owning role when it has one — the delivery manager owns a phase — falling
      // back to whoever is asking rather than to a hardcoded role name.
      roleCode: (run.owner_role_code as string | null) ?? actorRole,
      key: run.ticket_key as string,
      summary: `${wf?.label ?? wf?.code ?? "Phase"} — ${eng?.name ?? engagementId}`,
      facts: {
        "phase": wf?.label ?? wf?.code ?? null,
        "deliverables in this phase": tasks.map((t) => t.title).join("; ") || null,
      },
      doneCriteria: [],
    });
  }
  for (const t of tasks) {
    if (!t.ticket_key) continue;                       // not on the board yet; mirroring owes it first
    if (t.ticket_body_at && !opts.force) continue;     // already composed
    const step = stepOf(t);
    requests.push({
      ref: `task:${t.id}`,
      level: taskLevel,
      roleCode: t.role_code,
      key: t.ticket_key as string,
      summary: t.title,
      facts: {
        "subtitle": t.subtitle,
        "produces": step?.produces ?? null,
        "reads": (step?.reads ?? []).join(", ") || null,
        "owning role": t.role_code,
      },
      doneCriteria: t.workflow_step_id ? await doneCriteriaFor(t.workflow_step_id) : [],
    });
  }

  out.expected = requests.length;
  if (!requests.length) return { ...out, reason: "nothing-to-compose" };

  const byRole = new Map<string, TicketRequest[]>();
  for (const r of requests) byRole.set(r.roleCode, [...(byRole.get(r.roleCode) ?? []), r]);

  // One model call per role, up to `COMPOSE_CONCURRENCY` at once — see the file header. Every
  // group's outcome only ever touches `out` through a synchronous push/assign, never split across
  // an `await`, so interleaving groups here is safe: two groups can never observe or clobber each
  // other's half-written state, only decide in whichever order they actually finish which failure
  // `out.reason` ends up naming when more than one group has one.
  await mapWithConcurrency([...byRole.entries()], COMPOSE_CONCURRENCY, async ([roleCode, group]) => {
    const { bodies, problems, reason } = await composeTicketBody({
      engagementId, orgId, roleCode, programme, grounding, tickets: group,
    });
    out.problems.push(...problems);
    if (reason && !out.reason) out.reason = reason;

    for (const b of bodies) {
      if (!b.key) continue;
      const ok = await updateIssue(creds, b.key, { summary: b.summary, description: b.description });
      if (!ok) {
        // Loud. A ticket still carrying its placeholder is named, because a count of successes
        // cannot say which ones did not take.
        out.problems.push(`Jira refused the body for ${b.key} — it still carries its placeholder.`);
        out.reason = "patch-refused";
        continue;
      }
      // Jira first, then the local row — the same rule mirroring follows. A stamp written before
      // the PATCH would make a failed write permanent: the next run would skip it as done.
      const at = new Date().toISOString();
      if (b.ref.startsWith("task:")) {
        await sb.from("work_task").update({ ticket_body_at: at }).eq("id", b.ref.slice(5));
      } else {
        await sb.from("workflow_run").update({ ticket_body_at: at }).eq("id", b.ref.slice(4));
      }
      out.written.push(b);
    }
  });

  await emit({
    engagementId, subjectType: "workflow_run", subjectId: runId,
    verb: "tracker.bodies_composed", actorKind: "agent", actorRoleCode: actorRole,
    payload: {
      written: out.written.length, expected: out.expected,
      roles: [...byRole.keys()], problems: out.problems, reason: out.reason ?? null,
    },
  });

  return out;
}

/** `workflow_step` comes back as a row or a one-element array depending on the join. */
type TaskRow = { workflow_step?: unknown };
function stepOf(t: TaskRow): { ord?: number; produces?: string | null; reads?: string[] } | null {
  const s = t.workflow_step;
  const one = Array.isArray(s) ? s[0] : s;
  return (one as { ord?: number; produces?: string | null; reads?: string[] }) ?? null;
}
