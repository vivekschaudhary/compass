import { describe, it, expect, vi, beforeEach } from "vitest";

// Phase A readiness is the gate Sprint 0 now sits behind, so its refusal path is load-bearing:
// every failure it catches is otherwise SILENT (a workflow writes a page into a scaffold that
// doesn't exist, a human gate that can't transition, an unreachable provider indistinguishable
// from "not configured"). These pin the two properties that make it a gate rather than a hint —
// a probe that ERRORS must read as not-ready, and scm must NOT block doc work.

const probeDocs = vi.fn();
const projectStatuses = vi.fn();
const resolveJira = vi.fn();
const from = vi.fn();

vi.mock("./docstore", () => ({ probeDocs: (...a: unknown[]) => probeDocs(...a) }));
vi.mock("./jira", () => ({
  resolveJira: (...a: unknown[]) => resolveJira(...a),
  projectStatuses: (...a: unknown[]) => projectStatuses(...a),
}));
vi.mock("./supabase", () => ({ supabaseAdmin: () => ({ from: (t: string) => from(t) }) }));

import { engagementReadiness, readinessRefusal } from "./readiness";
import { STATUS } from "./lifecycle";

/** Minimal PostgREST-ish builder: engagement lookup, repo list, doc_page list. */
function db(opts: { eng?: Record<string, unknown> | null; repos?: unknown[]; pages?: { path: string }[] }) {
  const eng = opts.eng === undefined ? { id: "e1", docs_provider: "confluence", confluence_space: "SP" } : opts.eng;
  from.mockImplementation((table: string) => {
    if (table === "engagement") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: eng }) }) }) };
    }
    if (table === "repo") return { select: () => ({ eq: async () => ({ data: opts.repos ?? [] }) }) };
    return { select: () => ({ eq: async () => ({ data: opts.pages ?? [] }) }) };   // doc_page
  });
}

beforeEach(() => {
  probeDocs.mockResolvedValue(null);                       // null = reachable
  resolveJira.mockReturnValue({ project: "KAN" });
  projectStatuses.mockResolvedValue([STATUS.gate, "Done"]);
  db({ pages: [{ path: "02-scope/sow" }] , repos: [{ id: "r1" }] });
});

describe("engagementReadiness", () => {
  it("is ok when docs, tickets and the tree are all good", async () => {
    const r = await engagementReadiness("e1");
    expect(r.ok).toBe(true);
    expect(r.blocking).toHaveLength(0);
  });

  it("does NOT block on a missing repo — scm is needed for build, not for a brief", async () => {
    db({ repos: [], pages: [{ path: "02-scope/sow" }] });
    const r = await engagementReadiness("e1");
    expect(r.ok).toBe(true);
    expect(r.checks.find((c) => c.key === "scm.wired")!.ok).toBe(false);
    expect(r.blocking.map((c) => c.key)).not.toContain("scm.wired");
  });

  it("blocks when the doc tree was never scaffolded", async () => {
    db({ pages: [], repos: [{ id: "r1" }] });
    const r = await engagementReadiness("e1");
    expect(r.ok).toBe(false);
    expect(r.blocking.map((c) => c.key)).toContain("tree.scaffolded");
  });

  it("blocks when the board has no HITL gate status", async () => {
    // Without it every human gate fails to transition while the board looks healthy.
    projectStatuses.mockResolvedValue(["Backlog", "Done"]);
    const r = await engagementReadiness("e1");
    expect(r.ok).toBe(false);
    const c = r.blocking.find((x) => x.key === "tickets.wired")!;
    expect(c.detail).toContain(STATUS.gate);
  });

  it("blocks when the project can't be read at all", async () => {
    projectStatuses.mockResolvedValue(null);
    const r = await engagementReadiness("e1");
    expect(r.blocking.map((c) => c.key)).toContain("tickets.wired");
  });

  it("blocks when the docs provider is unreachable", async () => {
    probeDocs.mockResolvedValue("401 from Confluence");
    const r = await engagementReadiness("e1");
    expect(r.ok).toBe(false);
    expect(r.blocking.find((c) => c.key === "docs.wired")!.detail).toContain("401");
  });

  it("reads a probe FAILURE as not-ready, never as ready", async () => {
    // "We could not tell" must never present as "ready" — that is the whole reason this exists.
    probeDocs.mockRejectedValue(new Error("network down"));
    const r = await engagementReadiness("e1");
    expect(r.ok).toBe(false);
  });

  it("is not-ready for an unknown engagement", async () => {
    db({ eng: null });
    const r = await engagementReadiness("nope");
    expect(r.ok).toBe(false);
  });
});

describe("readinessRefusal", () => {
  it("names every blocking check and its remedy", async () => {
    db({ pages: [], repos: [] });
    projectStatuses.mockResolvedValue(null);
    const msg = readinessRefusal(await engagementReadiness("e1"));
    expect(msg).toContain("Phase A");
    expect(msg).toContain("tickets.wired");
    expect(msg).toContain("tree.scaffolded");
    expect(msg).toContain("→");                    // the remedy arrow
    expect(msg).not.toContain("scm.wired");        // reported, but not a blocker
  });
});
