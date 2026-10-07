import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { parseScaffoldRepos } = await import("./scaffold-repos");

const record = (rows: string[]) => `# Scaffold record

## Repositories

| key | name | framework |
|-----|------|-----------|
${rows.join("\n")}

## Assumptions

none
`;

describe("reading the repos from a scaffold record", () => {
  it("reads each row into a repo", () => {
    const r = parseScaffoldRepos(record(["| app | Web app | nextjs-ts |", "| api | API | nextjs-ts |"]));
    expect(r.problems).toEqual([]);
    expect(r.repos).toEqual([
      { key: "app", name: "Web app", framework: "nextjs-ts" },
      { key: "api", name: "API", framework: "nextjs-ts" },
    ]);
  });

  it("uses the key as the name when the name is blank", () => {
    const r = parseScaffoldRepos(record(["| app |  | nextjs-ts |"]));
    expect(r.repos[0].name).toBe("app");
  });

  it("reports a record with no Repositories table, rather than reading zero repos quietly", () => {
    const r = parseScaffoldRepos("# Scaffold record\n\nThe repos are the usual ones.\n");
    expect(r.repos).toEqual([]);
    expect(r.problems[0]).toMatch(/no Repositories table/);
  });

  it("reports a table with no rows", () => {
    const r = parseScaffoldRepos(record([]));
    expect(r.repos).toEqual([]);
    expect(r.problems[0]).toMatch(/lists no repos/);
  });

  it("refuses a framework the generator does not have, and keeps the valid rows", () => {
    const r = parseScaffoldRepos(record(["| app | Web | nextjs-ts |", "| api | API | rails |"]));
    expect(r.repos.map((x) => x.key)).toEqual(["app"]);
    expect(r.problems[0]).toMatch(/framework 'rails' is not one of/);
  });

  it("refuses a key that is not a slug, rather than creating a repo with it", () => {
    const r = parseScaffoldRepos(record(["| My App | x | nextjs-ts |"]));
    expect(r.repos).toEqual([]);
    expect(r.problems[0]).toMatch(/must be lowercase/);
  });

  it("refuses a repeated key", () => {
    const r = parseScaffoldRepos(record(["| app | a | nextjs-ts |", "| app | b | nextjs-ts |"]));
    expect(r.repos.map((x) => x.key)).toEqual(["app"]);
    expect(r.problems[0]).toMatch(/listed twice/);
  });

  it("strips backticks around the key and framework", () => {
    const r = parseScaffoldRepos(record(["| `app` | Web | `nextjs-ts` |"]));
    expect(r.repos).toEqual([{ key: "app", name: "Web", framework: "nextjs-ts" }]);
  });
});
