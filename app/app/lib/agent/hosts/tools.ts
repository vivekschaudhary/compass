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
];

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
