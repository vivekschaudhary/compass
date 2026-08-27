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
// TYPE-FIRST, NOT PHASE-FIRST. `composeTicketBody` takes an issue type and a role, so the same
// composer serves a triaged Bug, an ops Task and a bet's Epic when those surfaces are ported. Six
// other `createIssue` callers each invent their own description today; this is what they collapse
// into, and shaping it around phases would have guaranteed a seventh.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { resolveJira, updateIssue, type JiraCreds } from "../jira";
import { agentMarkdown, doneCriteriaFor, loadDocumentText } from "../agent/context";
import { selectHost, MODEL } from "../agent/hosts/select";
import { emit, orgIdFor } from "./events";
import { sortByStep } from "./steps";

/** The four Jira issue types Compass files. The prompt is shaped per type, not per caller. */
export type IssueType = "Epic" | "Story" | "Task" | "Bug";

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
  issueType: IssueType;
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
  | "no-agent-file" | "no-host" | "model-refused" | "model-silent" | "patch-refused";

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
 * What each issue type is FOR, in one line each.
 *
 * The five-question contract in the agent markdown holds for all four; this says what "the
 * deliverable" means for the type in hand, so an Epic does not get written as an oversized story
 * and a Bug does not get written as a work request.
 */
const TYPE_BRIEF: Record<IssueType, string> = {
  Epic: "A slice of the programme. Say what the slice delivers as a whole, what it unblocks " +
    "downstream, and how a reader will know it is finished. Not a list of its children.",
  Story: "One shippable deliverable. Say what it is, who needs it, and what acceptance looks like.",
  Task: "A change to make. Say what changes, why now, what it touches, and how it is undone if it " +
    "goes wrong.",
  Bug: "Something behaving wrongly. Say what was observed, where, who it affects, and what correct " +
    "looks like. Do not speculate about the cause beyond what the report supports.",
};

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
      `\n## ref \`${t.ref}\` — ${t.issueType}\n` +
      `- current title: ${t.summary}\n` +
      `- what this type is for: ${TYPE_BRIEF[t.issueType]}\n` +
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
  const { tickets, roleCode } = input;
  if (!tickets.length) return { bodies: [], problems: [], reason: "nothing-to-compose" };

  // The role's markdown IS the standard. Absent, there is no standard, and a body written anyway
  // would be the model's own idea of a ticket wearing the role's name.
  const md = await agentMarkdown(input.engagementId, input.orgId, roleCode);
  if (!md) {
    return {
      bodies: [], reason: "no-agent-file",
      problems: [
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
      messages: [{ role: "user", content: userPrompt(input.programme, input.grounding, tickets) }],
    });
  } catch (e) {
    return {
      bodies: [], reason: "no-host",
      problems: [`Could not reach a model host: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  if (result.stopReason === "refusal") {
    return {
      bodies: [], reason: "model-refused",
      problems: [`The model declined to write these bodies. ${result.refusalExplanation ?? "No explanation given."}`],
    };
  }

  const call = result.toolCall;
  if (!call || call.name !== BODY_TOOL.name) {
    return {
      bodies: [], reason: "model-silent",
      problems: [
        `The model answered without using \`${BODY_TOOL.name}\`` +
        (result.text ? `: ${result.text.slice(0, 300)}` : "."),
      ],
    };
  }

  const raw = (call.input as { tickets?: unknown })?.tickets;
  const returned = Array.isArray(raw) ? raw : [];
  const byRef = new Map(tickets.map((t) => [t.ref, t]));
  const bodies: ComposedBody[] = [];
  const problems: string[] = [];
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
  engagementId: string, runId: string, actorRole: string, opts: { force?: boolean } = {},
): Promise<Composed> {
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
  const grounding = [];
  for (const p of paths) grounding.push(await loadDocumentText(engagementId, p));

  const programme = {
    engagement: eng?.name ?? engagementId,
    context: [
      `Phase: ${wf?.label ?? wf?.code ?? "unnamed"}.`,
      `The epic covers the phase as a whole; each story is one deliverable within it.`,
    ],
  };

  // What is owed a body, grouped by the role that owns it.
  const requests: TicketRequest[] = [];
  if (run.ticket_key && (opts.force || !run.ticket_body_at)) {
    requests.push({
      ref: `run:${run.id}`,
      issueType: "Epic",
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
      issueType: "Story",
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

  for (const [roleCode, group] of byRole) {
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
  }

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
