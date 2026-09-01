// The tool contract, in one place because two hosts now need it.
//
// `ask` and `draft` are how a question reaches a human and how a draft becomes a document version
// with citations. The API host passes these as tool schemas; the CLI host cannot — the `claude`
// binary owns its own tool loop — so it passes `unionSchema(TOOLS)` as a structured-output schema
// instead. Same contract, two encodings.
//
// They are DERIVED from one another deliberately. A hand-written copy of these schemas in the CLI
// host is the failure AGENTS.md already records: a checker that carries the literal it is policing.
// Add a third tool here and both hosts follow.

import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { ASK_BATCH } from "../context";

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "ask",
    description:
      "Ask the human what you cannot responsibly infer from the documents you were given. " +
      "Use this for facts that were never recorded — dates nobody agreed, people nobody named, " +
      "standards nobody wrote down. Ask only what blocks you RIGHT NOW: the answers come back to " +
      "you and you get another turn, so anything a later answer would settle is not for this " +
      `round. Order the list by how much each answer changes the rest of the work — only the first ` +
      `${ASK_BATCH} are put to the human. Do not use this for anything the documents already answer.`,
    input_schema: {
      type: "object",
      properties: {
        preamble: {
          type: "string",
          description:
            "One or two sentences on what you found and why you are blocked.",
        },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The question, as you would ask a colleague.",
              },
              type: { type: "string", enum: ["text", "choice", "number"] },
              options: {
                type: "array",
                items: { type: "string" },
                description: "For type=choice.",
              },
              why: {
                type: "string",
                description: "What this changes about the deliverable.",
              },
              // Optional and `files_to` are what let an agent ask for SUPPORTING MATERIAL rather
              // than only for blocking facts. Without them the only question an agent could ask was
              // one that parks the task until someone answers, so it never asked "do you have a BRD?"
              // — and the backlog was written from the brief alone, which is thinner than it needs
              // to be when the client has requirements written down.
              optional: {
                type: "boolean",
                description:
                  "True when you can produce the deliverable without this answer. An optional " +
                  "question does not block: if nobody answers it, you draft anyway and say what " +
                  "you did not have. Use it for supporting material, never for a fact you need.",
              },
              files_to: {
                type: "string",
                description:
                  "A document path when the ANSWER IS ITSELF A DOCUMENT — a BRD, a policy, a " +
                  "client's existing backlog. The text is filed verbatim at that path and you read " +
                  "it as an input; it is not yours to rewrite. Omit for an ordinary question.",
              },
            },
            required: ["prompt", "type", "why"],
            additionalProperties: false,
          },
        },
      },
      required: ["preamble", "questions"],
      additionalProperties: false,
    },
    // Strict: the input is validated against this schema before it reaches us. Without it the
    // shape is a strong convention rather than a guarantee, and a `sections` that arrived as
    // something other than an array threw away a finished two-minute run at the filing step.
    strict: true,
  },
  {
    name: "draft",
    description:
      "Produce the deliverable. Every section names the document paths it was derived from. " +
      "A claim you cannot trace to a document you were given does not belong here.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "What you produced and what it is based on. Note any input that was missing and what it cost.",
        },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              body: { type: "string", description: "Markdown." },
              cites: {
                type: "array",
                items: { type: "string" },
                description:
                  "Document paths this section was derived from. Empty only if the section is genuinely your own judgment, and say so in the body.",
              },
            },
            required: ["heading", "body", "cites"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "sections"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "backlog",
    description:
      "Produce the backlog: the epics, and the stories under each one. Use this instead of `draft` " +
      "when the deliverable IS a backlog — the epics become real issues on the client's board, not " +
      "headings on a page, so they have to come back as structure rather than as prose someone " +
      "would have to re-read. Same evidence rule as `draft`: every epic and story traces to a " +
      "document you were given, and what you do not have you say rather than invent.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "What you produced and what it is based on. Note any input that was missing and what it cost.",
        },
        epics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              // The agent's own handle, and the ONLY thing tying a story to its parent before
              // anything has an id. Echoed into `parent_ref` below.
              ref: {
                type: "string",
                description: "A short handle for this epic, unique in this backlog — e.g. `E1`.",
              },
              title: { type: "string", description: "The epic's title, in the product's vocabulary." },
              body: { type: "string", description: "Markdown. What the slice delivers and what it unblocks." },
              cites: {
                type: "array",
                items: { type: "string" },
                description: "Document paths this epic was derived from.",
              },
              stories: {
                type: "array",
                description:
                  "The stories under this epic. Each is one shippable, user-observable deliverable — " +
                  "never a technical task, and never a restatement of the epic.",
                items: {
                  type: "object",
                  properties: {
                    ref: { type: "string", description: "A handle unique in this backlog — e.g. `E1-S1`." },
                    title: { type: "string" },
                    body: { type: "string", description: "Markdown." },
                    cites: { type: "array", items: { type: "string" } },
                  },
                  required: ["ref", "title", "body", "cites"],
                  additionalProperties: false,
                },
              },
            },
            required: ["ref", "title", "body", "cites", "stories"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "epics"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "sprint",
    description:
      "Plan ONE sprint: commit to a set of stories that already exist on the board, and say which " +
      "role owns each one. Use this instead of `draft` when the deliverable IS a sprint plan. You " +
      "are not writing new stories — you are choosing from the ones you were given and committing " +
      "to what the roster can actually finish in one sprint. The plan you write is the readable " +
      "record; the commitments are what reaches the board, so they have to come back as structure. " +
      "Same evidence rule as `draft`: commit only to stories you were shown, and where the roster " +
      "cannot cover the work, say so in the plan rather than quietly committing to it anyway.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "What you committed to and why. Note any input that was missing and what it cost.",
        },
        goal: {
          type: "string",
          description: "The one outcome this sprint is for, in the product's vocabulary.",
        },
        starts: { type: "string", description: "First day of the sprint, ISO `YYYY-MM-DD`." },
        ends: { type: "string", description: "Last day of the sprint, ISO `YYYY-MM-DD`." },
        commitments: {
          type: "array",
          description:
            "The stories this sprint commits to. Choose only from the committable stories you were " +
            "given, and size the set against the roster you were given — a plan that does not fit " +
            "and says so is useful; one that does not fit and does not say so is not.",
          items: {
            type: "object",
            properties: {
              ref: {
                type: "string",
                description:
                  "The story's ref as you were given it — e.g. `E1-S3`. Not a Jira key.",
              },
              role: {
                type: "string",
                enum: ["designer", "ux-writer", "engineer", "automation", "sre", "architect"],
                description:
                  "Who owns this story. `designer` when it needs new screens or flows; " +
                  "`ux-writer` when the work is the words on a screen; `automation` when SRE, " +
                  "DevOps, pipeline or QA owns the outcome; `architect` when the deliverable is a " +
                  "technical design rather than shipped behaviour; `engineer` otherwise. Judge the " +
                  "story, not the epic it sits under.",
              },
              why: {
                type: "string",
                description: "One line: why that role owns it. A person checks this routing.",
              },
            },
            required: ["ref", "role", "why"],
            additionalProperties: false,
          },
        },
        sections: {
          type: "array",
          description:
            "The readable plan — the goal, the shape of the sprint, capacity, risks, and anything " +
            "the roster cannot cover. The commitments table is appended for you; do not write it.",
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              body: { type: "string", description: "Markdown." },
              cites: {
                type: "array",
                items: { type: "string" },
                description: "Document paths this section was derived from.",
              },
            },
            required: ["heading", "body", "cites"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "goal", "starts", "ends", "commitments", "sections"],
      additionalProperties: false,
    },
    strict: true,
  },
];

/**
 * Which producing path unlocks which specialised tool.
 *
 * THE ANTI-DRIFT SEAM. `sprint-0.draft-sprint-plan` and `sprint.sprint-planning` are the same step
 * written twice — sprint 0 has to end with sprint 1 planned, and every sprint after plans itself.
 * Keying the tool on the produced PATH rather than on either row's slug is what makes them the same
 * behaviour by construction: `materialise.ts`'s REGISTRY is keyed the same way, and the criteria are
 * held identical by `seed-consistency-check.py`.
 *
 * It is also a guard. A step that does not produce a backlog cannot call `backlog`, so a model
 * cannot decide to return epics from a step whose approval has nothing to do with them.
 */
export const PRODUCES_TOOL: Record<string, string> = {
  "02-scope/deliverables": "backlog",
  "05-cadence/sprint-plans": "sprint",
};

/** Every tool that is not gated behind a produced path. */
const GENERAL = new Set(["ask", "draft"]);

/**
 * The tools a step may call, given what it produces.
 *
 * A specialised tool replaces `draft` rather than joining it: a step that produces a sprint plan
 * has one way to produce it, and offering both invites a model to file a plan whose commitments
 * never reach the board — a document that looks complete and does nothing.
 */
export function toolsFor(produces: string | null | undefined): Anthropic.Tool[] {
  const special = produces ? PRODUCES_TOOL[produces] : undefined;
  return TOOLS.filter((t) =>
    special ? t.name === "ask" || t.name === special : GENERAL.has(t.name),
  );
}

/**
 * The tools as ONE structured-output schema, for a host that cannot take tool definitions.
 *
 * `{ tool, input }` rather than a flat merge of every tool's properties: a flat union cannot
 * express per-branch `required`, so a `draft` with no `sections` would validate and produce an
 * empty document. `oneOf` keeps each branch's requirements intact — verified against the real
 * binary, both branches, before this was relied on.
 */
export function unionSchema(tools: Anthropic.Tool[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      tool: { type: "string", enum: tools.map((t) => t.name) },
      input: { oneOf: tools.map((t) => t.input_schema) },
    },
    required: ["tool", "input"],
    additionalProperties: false,
  };
}
