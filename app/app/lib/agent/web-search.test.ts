import { describe, it, expect, vi } from "vitest";

// `hasWebSearch` is resolved ONCE in `buildContext`, from `actor.capabilities` — not re-derived by
// `systemPrompt` or `run.ts`. These three tests cover the chain end to end:
//   1. `buildContext` turns `role.capabilities` into `ctx.hasWebSearch`
//   2. `systemPrompt` tells the model it has real web search only when that's true
//   3. `apiHost.dispatch` appends Anthropic's native tool only when the host is actually asked for it,
//      and the client-tool-call lookup still ignores the server tool's own content blocks

vi.mock("server-only", () => ({}));

describe("buildContext: role.capabilities -> ctx.hasWebSearch", () => {
  // A single generic mock, keyed by table: `work_task` returns a real (step-less) row so
  // `buildContext` gets past its one `must()` guard; every other table answers empty, which lets
  // every downstream loader (`ensureInputs`, `loadInventory`, `loadPhaseRows`, `loadPriorDraft`,
  // `loadRejections`, `agentMarkdown`'s own `role` lookup) resolve without needing its own mock —
  // none of them are what this test is about.
  vi.doMock("../supabase", () => ({
    must: (_what: string, r: { data: unknown }) => r.data,
    supabaseAdmin: () => ({
      from: (table: string) => {
        const q = {
          select: () => q, eq: () => q, is: () => q, in: () => q, order: () => q, limit: () => q,
          maybeSingle: async () =>
            table === "work_task"
              ? { data: { id: "t1", title: "Research the bet", subtitle: "", role_code: "researcher", workflow_step_id: null, workflow_run_id: null } }
              : { data: null },
          single: async () => ({ data: null, error: null }),
          then: (res: (v: { data: unknown; error: null }) => void) => res({ data: [], error: null }),
        };
        return q;
      },
    }),
  }));

  it("is true when the role's capabilities include web-search", async () => {
    const { buildContext } = await import("./context");
    const actor = { engagementId: "e1", orgId: "org1", roleCode: "researcher", capabilities: ["web-search"] };
    const ctx = await buildContext(actor as never, "t1");
    expect(ctx?.hasWebSearch).toBe(true);
  });

  it("is false when it doesn't", async () => {
    const { buildContext } = await import("./context");
    const actor = { engagementId: "e1", orgId: "org1", roleCode: "designer", capabilities: [] };
    const ctx = await buildContext(actor as never, "t1");
    expect(ctx?.hasWebSearch).toBe(false);
  });
});

describe("systemPrompt: the web-search line", () => {
  const BASE = {
    taskId: "t1", engagementId: "e1", taskTitle: "Research the bet", taskSubtitle: "",
    roleCode: "researcher", agentFile: "# Agent: Researcher", produces: "research", unresolvedProduces: null,
    renders: "doc", reviewPath: null, destination: "docs",
    output: null, inputs: [], doneCriteria: [], inventory: [], phaseRows: [],
    template: null, templateName: null,
    priorDraft: null, rejections: [], sprint: null,
  } as const;

  it("tells the model it has real web search when hasWebSearch is true", async () => {
    const { systemPrompt } = await import("./context");
    const p = systemPrompt({ ...BASE, hasWebSearch: true } as never);
    expect(p).toContain("You have real web search");
  });

  it("says nothing about it otherwise", async () => {
    const { systemPrompt } = await import("./context");
    const p = systemPrompt({ ...BASE, hasWebSearch: false } as never);
    expect(p).not.toContain("real web search");
  });
});

describe("apiHost.dispatch: the native web_search tool", () => {
  const finalMessage = vi.fn();
  const stream = vi.fn((_params: { tools: unknown[] }) => ({ finalMessage }));
  vi.doMock("@anthropic-ai/sdk", () => ({
    default: class { messages = { stream } },
  }));

  const baseMessage = {
    stop_reason: "end_turn", stop_details: null,
    content: [{ type: "text", text: "done" }],
    usage: { input_tokens: 1, output_tokens: 1 },
  };

  it("is appended only when wantsWebSearch is true", async () => {
    const { apiHost } = await import("./hosts/api");
    finalMessage.mockResolvedValue(baseMessage);

    await apiHost.dispatch({
      model: "m", system: "s", messages: [], tools: [], maxTokens: 1, wantsWebSearch: true,
    });
    const toolsSent = stream.mock.calls.at(-1)?.[0].tools;
    expect(toolsSent).toContainEqual({ type: "web_search_20250305", name: "web_search" });

    await apiHost.dispatch({
      model: "m", system: "s", messages: [], tools: [], maxTokens: 1, wantsWebSearch: false,
    });
    const toolsSentAfter = stream.mock.calls.at(-1)?.[0].tools;
    expect(toolsSentAfter).toEqual([]);
  });

  it("still finds the real domain tool call, ignoring any server_tool_use block", async () => {
    const { apiHost } = await import("./hosts/api");
    finalMessage.mockResolvedValue({
      ...baseMessage,
      content: [
        { type: "server_tool_use", id: "srv1", name: "web_search", input: { query: "x" } },
        { type: "tool_use", id: "call1", name: "draft", input: { sections: [] } },
      ],
    });

    const out = await apiHost.dispatch({
      model: "m", system: "s", messages: [], tools: [], maxTokens: 1, wantsWebSearch: true,
    });
    expect(out.toolCall).toEqual({ name: "draft", input: { sections: [] } });
  });
});
