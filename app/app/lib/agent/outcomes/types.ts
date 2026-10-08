import type { Actor } from "../../data/actor";
import type { AgentContext } from "../context";
import type { HostResult } from "../hosts/types";

export type AgentOutcome =
  | {
      kind: "asked";
      preamble: string;
      questions: { prompt: string; type: string; why: string }[];
    }
  | {
      kind: "drafted";
      summary: string;
      sections: number;
      path: string | null;
      publishedUrl?: string | null;
    }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

/**
 * What every outcome handler is handed: the actor and context a guard clause in `run.ts` has
 * already resolved and validated, plus the model's reply — decomposed once, in `run.ts`, so no
 * handler re-derives `text`/`truncated` from `message` its own way.
 */
export type Turn = {
  actor: Actor;
  taskId: string;
  ctx: AgentContext;
  message: HostResult;
  text: string;
  truncated: boolean;
  call: { name: string; input: unknown };
};
