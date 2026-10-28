import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

let docRow: Record<string, unknown> | null = null;
vi.mock("../../supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q, eq: () => q,
        maybeSingle: async () => ({ data: table === "document" ? docRow : { id: "e1" } }),
      };
      return q;
    },
  }),
}));
const readProviderDoc = vi.fn();
vi.mock("../../docstore", () => ({ readProviderDoc: (...a: unknown[]) => readProviderDoc(...a) }));
const issueText = vi.fn();
const jiraForEngagement = vi.fn();
vi.mock("../../jira", () => ({
  issueText: (...a: unknown[]) => issueText(...a),
  jiraForEngagement: (...a: unknown[]) => jiraForEngagement(...a),
}));

const { externalFallback, ticketForPath } = await import("./external-fallback");
const story = { ref: "E1-S1", key: "CT-359", epicKey: "CT-288" };

beforeEach(() => {
  docRow = null;
  readProviderDoc.mockReset(); issueText.mockReset(); jiraForEngagement.mockReset().mockResolvedValue({ project: "CT" });
});

describe("ticketForPath", () => {
  it("epic pages name the epic's ticket", () => {
    expect(ticketForPath("epic/CT-288", story)).toBe("CT-288");
  });
  it("a story run's stories page is answered by the STORY's own ticket", () => {
    expect(ticketForPath("stories/CT-288", story)).toBe("CT-359");
  });
  it("a stories page for some other epic is that epic's ticket", () => {
    expect(ticketForPath("stories/CT-300", story)).toBe("CT-300");
  });
  it("a path that names no ticket names none", () => {
    expect(ticketForPath("foundational-architecture", story)).toBeNull();
    expect(ticketForPath("epic/{epic}", story)).toBeNull();
    expect(ticketForPath("epic/not a key", story)).toBeNull();
  });
});

describe("externalFallback", () => {
  it("reads the provider page the document row points at, first", async () => {
    docRow = { title: "Sign-in design", provider: "confluence", external_id: "123" };
    readProviderDoc.mockResolvedValue("  the design  ");
    expect(await externalFallback("e1", "epic/CT-288", story)).toEqual({
      path: "epic/CT-288", title: "Sign-in design", version: "confluence", body: "the design",
    });
    expect(issueText).not.toHaveBeenCalled();
  });

  it("falls to the ticket when there is no document, and says the text came from Jira", async () => {
    issueText.mockResolvedValue({ summary: "Apple sign-in", description: "As a user…" });
    expect(await externalFallback("e1", "stories/CT-288", story)).toEqual({
      path: "stories/CT-288", title: "Apple sign-in", version: "jira CT-359", body: "## Apple sign-in\nAs a user…",
    });
    expect(issueText).toHaveBeenCalledWith({ project: "CT" }, "CT-359");
  });

  it("falls to the ticket when the provider page cannot be read or is empty", async () => {
    docRow = { title: "d", provider: "confluence", external_id: "123" };
    readProviderDoc.mockRejectedValue(new Error("down"));
    issueText.mockResolvedValue({ summary: "S", description: "text" });
    expect((await externalFallback("e1", "epic/CT-288", story))?.version).toBe("jira CT-288");
  });

  it("is null — an absence, not an empty page — when nothing answers", async () => {
    issueText.mockResolvedValue(null);
    expect(await externalFallback("e1", "epic/CT-288", story)).toBeNull();
  });

  it("is null for a ticket with no description rather than an empty body", async () => {
    issueText.mockResolvedValue({ summary: "S", description: "" });
    expect(await externalFallback("e1", "epic/CT-288", story)).toBeNull();
  });

  it("never reaches Jira for a path that names no ticket", async () => {
    expect(await externalFallback("e1", "foundational-architecture", story)).toBeNull();
    expect(issueText).not.toHaveBeenCalled();
  });

  it("no Jira credentials: null, not a throw", async () => {
    jiraForEngagement.mockResolvedValue(null);
    expect(await externalFallback("e1", "epic/CT-288", story)).toBeNull();
  });
});
