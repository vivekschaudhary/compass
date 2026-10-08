import { describe, it, expect, vi } from "vitest";

// `conversationFor` — the scope check `conversation(taskId)` itself does not have, and now needs:
// unlike the page (which only ever reaches `conversation` after `buildContext` already validated
// engagement access), the lightweight turns refresh (`getConversationAction`) is a server action
// reachable directly from the client with nothing but a taskId. Without this check it would hand
// back any task's conversation to anyone who could resolve a role on ANY engagement.

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ emit: async () => {} }));
vi.mock("./links", () => ({ expandLinks: async (b: string) => b }));
vi.mock("./publish", () => ({ publishToDocs: async () => ({ ok: true, url: null, id: null }) }));

const turnRows = [
  { id: "t1", ord: 0, author_kind: "human", author_role_code: null, author_user_id: "Alex", body: "hi", created_at: "2026-01-01" },
];

let taskEngagementId: string | null = "e1";

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "work_task") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () =>
                  taskEngagementId === "e1"
                    ? { data: { id: "t1" }, error: null }
                    : { data: null, error: null },
              }),
            }),
          }),
        };
      }
      if (table === "turn") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: turnRows, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const { conversationFor } = await import("./job");

const actor = { engagementId: "e1", orgId: "org1", roleCode: "staff-engineer", holder: "Alex", scope: "workstream" };

describe("conversationFor", () => {
  it("returns the conversation when the task belongs to the actor's engagement", async () => {
    taskEngagementId = "e1";
    const turns = await conversationFor(actor as never, "t1");
    expect(turns).toHaveLength(1);
    expect(turns[0].body).toBe("hi");
  });

  it("returns nothing for a task in a different engagement — the whole point of this wrapper", async () => {
    taskEngagementId = "some-other-engagement";
    const turns = await conversationFor(actor as never, "t1");
    expect(turns).toEqual([]);
  });
});
