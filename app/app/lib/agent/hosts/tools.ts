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
