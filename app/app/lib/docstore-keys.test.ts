import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// `docstore.ts` reaches Confluence and Microsoft Graph. Only the key checks are under test, so the
// Graph side is stubbed away and Confluence is answered by a fake `fetch` — the decisions these
// functions encode are about the RESPONSE, and a live account would make them untestable.
vi.mock("./graph", () => ({
  resolveGraphCreds: () => null, resolveSite: async () => "", defaultDrive: async () => "",
  ensureFolder: async () => ({ id: "", url: "" }), ensureFile: async () => ({ id: "", url: "" }),
  readFile: async () => "", safeName: (s: string) => s, deleteItem: async () => true,
}));

const { checkSpaceKey, checkProjectKey, canonicalSpaceKey, canonicalProjectKey } =
  await import("./docstore");

// Credentials on the engagement itself, so nothing falls through to the environment.
const ENG = {
  id: "e1", name: "Health provider", docs_provider: "confluence",
  atlassian_base_url: "https://example.atlassian.net",
  atlassian_email: "someone@example.com",
  atlassian_api_token: "token",
};

/** The two shapes Confluence and Jira return, keyed by which endpoint was asked for. */
function respondWith(opts: {
  spaces?: { key: string; name: string }[];
  projects?: { key: string; name: string }[];
  ok?: boolean;
}) {
  const { spaces = [], projects = [], ok = true } = opts;
  return vi.fn(async (url: string) => {
    const body = url.includes("/wiki/rest/api/space") ? { results: spaces } : { values: projects };
    return { ok, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
  });
}

const SPACES = [{ key: "Test1", name: "Test" }, { key: "DHCS", name: "Provider FFS" }];
const PROJECTS = [{ key: "TEST1", name: "Test1" }, { key: "KAN", name: "Home-app" }];

beforeEach(() => { vi.stubGlobal("fetch", respondWith({ spaces: SPACES, projects: PROJECTS })); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("canonicalProjectKey", () => {
  // Uppercase is a platform invariant, not a preference — Jira enforces it at project creation.
  it("upper-cases and trims", () => {
    expect(canonicalProjectKey("test1")).toBe("TEST1");
    expect(canonicalProjectKey("  TeSt1 ")).toBe("TEST1");
  });

  // Null rather than "" so the column holds "no project", not a key that is the empty string.
  it("is null for nothing", () => {
    for (const v of [null, undefined, "", "   "]) expect(canonicalProjectKey(v)).toBeNull();
  });
});

describe("checkProjectKey", () => {
  // The bug this whole change exists for: `test1` was refused against a live key of `TEST1`.
  it("accepts any casing of a key that exists", async () => {
    for (const given of ["TEST1", "test1", "TeSt1", " test1 "]) {
      expect(await checkProjectKey(ENG, given)).toBeNull();
    }
  });

  // The name/key trap survives normalisation: the project NAMED "Test1" has the key "TEST1", and
  // "Home-app" is a name no amount of upper-casing turns into "KAN".
  it("names the key when given a project's display name", async () => {
    const msg = await checkProjectKey(ENG, "Home-app");
    expect(msg).toContain("'KAN'");
    expect(msg).toContain("named 'Home-app'");
  });

  it("refuses a key that is genuinely absent", async () => {
    const msg = await checkProjectKey(ENG, "NOPE");
    expect(msg).toContain("No Jira project with key 'NOPE'");
    expect(msg).toContain("not the project's display name");
  });

  // "Cannot check" is not the same as "wrong" — an unreachable Jira must not block an intake.
  it("passes when the call fails", async () => {
    vi.stubGlobal("fetch", respondWith({ ok: false }));
    expect(await checkProjectKey(ENG, "NOPE")).toBeNull();
  });

  it("passes when unconfigured", async () => {
    expect(await checkProjectKey({ id: "e", name: "n" }, "TEST1")).toBeNull();
  });
});

describe("checkSpaceKey", () => {
  // Confluence resolves a space key in any casing, so refusing on case alone rejected a key that
  // would have worked — the check was stricter than the API it guards.
  it("accepts any casing of a key that exists", async () => {
    for (const given of ["Test1", "test1", "TEST1", " test1 "]) {
      expect(await checkSpaceKey(ENG, given)).toBeNull();
    }
  });

  // Substituting a NAME for a key is a different string and a guess about intent — still refused.
  it("names the key when given a space's display name", async () => {
    const msg = await checkSpaceKey(ENG, "Test");
    expect(msg).toContain("'Test1'");
    expect(msg).toContain("named 'Test'");
  });

  it("refuses a key that is genuinely absent", async () => {
    expect(await checkSpaceKey(ENG, "NOPE")).toContain("No Confluence space with key 'NOPE'");
  });

  it("passes when the call fails", async () => {
    vi.stubGlobal("fetch", respondWith({ ok: false }));
    expect(await checkSpaceKey(ENG, "NOPE")).toBeNull();
  });
});

describe("canonicalSpaceKey", () => {
  it("returns the spelling Confluence uses", async () => {
    expect(await canonicalSpaceKey(ENG, "test1")).toBe("Test1");
    expect(await canonicalSpaceKey(ENG, "TEST1")).toBe("Test1");
  });

  // Null means "could not resolve", and the caller then stores what it was given. Returning the
  // input here instead would make an unreachable Confluence indistinguishable from a confirmed key.
  it("is null when the key is absent or the call fails", async () => {
    expect(await canonicalSpaceKey(ENG, "NOPE")).toBeNull();
    vi.stubGlobal("fetch", respondWith({ ok: false }));
    expect(await canonicalSpaceKey(ENG, "Test1")).toBeNull();
  });
});
