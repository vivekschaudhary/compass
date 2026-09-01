import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { buildArgv, subscriptionEnv, flattenMessages, toHostResult, makeCliHost } =
  await import("./cli");
const { TOOLS, unionSchema, toolsFor } = await import("./tools");

const req = (over: Record<string, unknown> = {}) => ({
  model: "claude-opus-5",
  system: "You are the delivery manager.",
  messages: [{ role: "user" as const, content: "Draft the timeline." }],
  tools: TOOLS,
  maxTokens: 64000,
  ...over,
});

/** One `result` event, as the CLI emits it: structured output is a JSON STRING inside it. */
const stream = (result: unknown, extra: Record<string, unknown> = {}) =>
  [
    JSON.stringify({ type: "assistant", message: {} }),
    JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      stop_reason: "end_turn",
      total_cost_usd: 0.24,
      result: typeof result === "string" ? result : JSON.stringify(result),
      ...extra,
    }),
  ].join("\n");

describe("buildArgv", () => {
  const argv = buildArgv(req());
  const flag = (name: string) => argv[argv.indexOf(name) + 1];

  // Claude Code ships Read/Edit/Bash ON. A drafting agent with filesystem access can source a
  // claim from disk instead of the pinned documents, and nothing downstream would show it.
  it("disables every built-in tool", () => {
    expect(argv).toContain("--tools");
    expect(flag("--tools")).toBe("");
  });

  // THE TRAP. --bare reads like the right flag for a minimal invocation and its own help says
  // OAuth and keychain are never read — it silently defeats the subscription this host exists for.
  it("never passes --bare", () => {
    expect(argv).not.toContain("--bare");
  });

  it("streams, so the idle guard has something to watch", () => {
    expect(flag("--output-format")).toBe("stream-json");
    expect(argv).toContain("--verbose");
  });

  it("isolates from the consumer repo's settings", () => {
    expect(argv).toContain("--setting-sources");
    expect(flag("--setting-sources")).toBe("");
  });

  it("matches the API host's effort", () => {
    expect(flag("--effort")).toBe("high");
  });

  // The whole point of deriving rather than hand-writing: a third tool must not leave this host
  // describing two.
  it("carries a schema derived from TOOLS, not a copy", () => {
    const schema = JSON.parse(flag("--json-schema"));
    expect(schema.properties.tool.enum).toEqual(TOOLS.map((t) => t.name));
    expect(schema.properties.input.oneOf).toHaveLength(TOOLS.length);
    expect(schema).toEqual(unionSchema(TOOLS));
  });

  // `oneOf` rather than a flat merge, so each branch keeps its own `required`. A flat union would
  // let a `draft` with no sections validate and produce an empty document.
  it("keeps each tool's required fields intact", () => {
    const schema = unionSchema(TOOLS);
    const draft = (schema.properties as Record<string, { oneOf?: { required?: string[] }[] }>)
      .input.oneOf!.find((b) => b.required?.includes("sections"));
    expect(draft?.required).toContain("summary");
  });
});

describe("subscriptionEnv", () => {
  // v1 calls this the flat-cost guarantee, not a nicety: the CLI prefers an env API key over the
  // subscription login, so one left set bills the metered API and defeats the host entirely.
  it("removes every metered credential", () => {
    const out = subscriptionEnv({
      ANTHROPIC_API_KEY: "sk-ant-live",
      ANTHROPIC_AUTH_TOKEN: "tok",
      ANTHROPIC_BASE_URL: "https://example",
      PATH: "/usr/bin",
    });
    expect(out.ANTHROPIC_API_KEY).toBeUndefined();
    expect(out.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(out.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(out.PATH).toBe("/usr/bin");
  });

  it("does not mutate the caller's environment", () => {
    const env = { ANTHROPIC_API_KEY: "sk-ant-live" };
    subscriptionEnv(env);
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-live");
  });
});

describe("flattenMessages", () => {
  it("marks who said what", () => {
    const out = flattenMessages([
      { role: "user", content: "Draft it." },
      { role: "assistant", content: "I need the SOW." },
    ]);
    expect(out).toContain("[user]\nDraft it.");
    expect(out).toContain("[assistant]\nI need the SOW.");
  });

  // Refused rather than coerced: a block array stringified to "[object Object]" would send a
  // prompt that looks full and says nothing, and the run would fail for an unrelated-looking reason.
  it("refuses content blocks instead of stringifying them", () => {
    expect(() =>
      flattenMessages([{ role: "user", content: [{ type: "text", text: "hi" }] }]),
    ).toThrow(/block array/);
  });
});

describe("toHostResult", () => {
  it("maps a draft to a tool call", () => {
    const r = toHostResult(
      stream({ tool: "draft", input: { summary: "s", sections: [{ heading: "h", body: "b", cites: ["02-scope/sow"] }] } }),
    );
    expect(r.toolCall?.name).toBe("draft");
    expect((r.toolCall?.input as { sections: unknown[] }).sections).toHaveLength(1);
    expect(r.stopReason).toBe("tool_use");
    expect(r.text).toBe("");
  });

  it("maps an ask to a tool call", () => {
    const r = toHostResult(
      stream({ tool: "ask", input: { preamble: "p", questions: [{ prompt: "q", type: "text", why: "w" }] } }),
    );
    expect(r.toolCall?.name).toBe("ask");
  });

  // Never a fabricated figure. The CLI reports total_cost_usd, but it is an API-EQUIVALENT number,
  // and writing it here would make a flat-cost run look metered and false-trip any cost guard.
  it("reports no usage even though the CLI reports a cost", () => {
    const r = toHostResult(stream({ tool: "draft", input: { summary: "s", sections: [] } }));
    expect(r.usage).toBeNull();
  });

  // Losing minutes of model work to an exception is worse than handing it back as text — run.ts
  // already records a turn with no tool call and leaves the task open for a human.
  it("hands back unparseable output as text rather than throwing", () => {
    const r = toHostResult(stream("I could not do this."));
    expect(r.toolCall).toBeNull();
    expect(r.text).toBe("I could not do this.");
  });

  // The CLI reports auth and usage-limit failures as a SUCCESSFUL process with is_error set.
  it("surfaces a CLI-reported error as text", () => {
    const r = toHostResult(stream("Not logged in · Please run /login", { is_error: true }));
    expect(r.stopReason).toBe("error");
    expect(r.text).toContain("Not logged in");
  });

  // A stream that ends with no verdict is a failed run, not an empty one — the difference between
  // "the agent produced nothing" and "we never found out".
  it("throws when the stream carries no result event", () => {
    expect(() => toHostResult(JSON.stringify({ type: "assistant" }))).toThrow(/no result event/);
  });

  it("ignores the stdin warning the CLI can prefix to stdout", () => {
    const r = toHostResult(
      "Warning: no stdin data received in 3s, proceeding without it.\n" +
        stream({ tool: "draft", input: { summary: "s", sections: [] } }),
    );
    expect(r.toolCall?.name).toBe("draft");
  });
});

describe("dispatch", () => {
  it("sends the flattened conversation as the last argument", async () => {
    let seen: string[] = [];
    const host = makeCliHost(async (argv) => {
      seen = argv;
      return stream({ tool: "draft", input: { summary: "s", sections: [] } });
    });
    await host.dispatch(req());
    expect(seen[seen.length - 1]).toContain("[user]\nDraft the timeline.");
  });

  it("strips the API key from what the child receives", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-should-not-reach-the-child";
    let env: Record<string, string | undefined> = {};
    const host = makeCliHost(async (_argv, opts) => {
      env = opts.env;
      return stream({ tool: "draft", input: { summary: "s", sections: [] } });
    });
    await host.dispatch(req());
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("guards on silence, not on duration", async () => {
    let opts = { idleMs: 0, hardMs: 0 };
    const host = makeCliHost(async (_argv, o) => {
      opts = o;
      return stream({ tool: "draft", input: { summary: "s", sections: [] } });
    });
    await host.dispatch(req());
    // The idle window must be well under the backstop, or the backstop is doing the work and a
    // long-but-healthy run gets killed — the #152 defect.
    expect(opts.idleMs).toBeLessThan(opts.hardMs);
    expect(opts.idleMs).toBeGreaterThanOrEqual(120_000);
  });
});

// Which tool a step may call is keyed on WHAT IT PRODUCES, not on its slug. That is what makes
// `sprint-0.draft-sprint-plan` and `sprint.sprint-planning` the same step written twice without
// being able to drift — and it is also a guard, because a model that can reach for `backlog` from
// any step can return epics from one whose approval has nothing to do with them.
describe("toolsFor", () => {
  const names = (produces: string | null) => toolsFor(produces).map((t) => t.name).sort();

  it("gives an ordinary step ask and draft", () => {
    expect(names("01-foundation/team")).toEqual(["ask", "draft"]);
    expect(names(null)).toEqual(["ask", "draft"]);
  });

  it("gives both sprint-planning rows the same tool, because both produce the same path", () => {
    expect(names("05-cadence/sprint-plans")).toEqual(["ask", "sprint"]);
  });

  it("gives the epics step the backlog tool", () => {
    expect(names("02-scope/deliverables")).toEqual(["ask", "backlog"]);
  });

  // A specialised tool REPLACES draft rather than joining it. Offering both would let a model file
  // a sprint plan as prose whose commitments never reach the board — a document that looks
  // complete and does nothing.
  it("does not leave draft available beside a specialised tool", () => {
    expect(names("05-cadence/sprint-plans")).not.toContain("draft");
    expect(names("02-scope/deliverables")).not.toContain("draft");
  });

  it("never withholds ask — every step can still say what it does not know", () => {
    for (const p of [null, "01-foundation/team", "02-scope/deliverables", "05-cadence/sprint-plans"]) {
      expect(names(p)).toContain("ask");
    }
  });

  // The CLI host builds its schema from the tools it is HANDED, so the filtering reaches it too.
  it("narrows the CLI host's schema as well", () => {
    const schema = unionSchema(toolsFor("05-cadence/sprint-plans")) as
      { properties: { tool: { enum: string[] } } };
    expect(schema.properties.tool.enum).toEqual(["ask", "sprint"]);
  });
});
