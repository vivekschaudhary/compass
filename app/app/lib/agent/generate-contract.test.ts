import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseRequest, parseResult, ContractError } from "./generate-contract";

// The same fixtures the Python contract tests read. One file per shape, shared by both sides.
const FIXTURES = resolve(__dirname, "../../../../compass/orchestrator/tests/fixtures");
const load = (name: string) => JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8"));

describe("generator request contract", () => {
  it("accepts the shared fixture", () => {
    const r = parseRequest(load("generate_request.json"));
    expect(r.framework).toBe("nextjs-ts");
    expect(r.caller.kind).toBe("ts");
    expect(r.checks).toBeUndefined();
  });

  it("refuses an unknown framework before anything runs", () => {
    expect(() => parseRequest({ ...load("generate_request.json"), framework: "rails" }))
      .toThrow(/not a supported framework/);
  });

  it("refuses a wrong version", () => {
    expect(() => parseRequest({ ...load("generate_request.json"), version: 2 })).toThrow(ContractError);
  });

  it("refuses a blank repo path rather than passing it on", () => {
    const d = load("generate_request.json");
    expect(() => parseRequest({ ...d, repo: { ...d.repo, local_path: "  " } })).toThrow(/local_path/);
  });

  it("refuses an unknown caller kind", () => {
    const d = load("generate_request.json");
    expect(() => parseRequest({ ...d, caller: { ...d.caller, kind: "agent" } })).toThrow(/caller.kind/);
  });

  it("treats absent options as empty, but refuses a non-string", () => {
    const d = load("generate_request.json");
    const { options: _omit, ...without } = d;
    expect(parseRequest(without).options).toBe("");
    expect(() => parseRequest({ ...d, options: 42 })).toThrow(/options must be a string/);
  });

  it("refuses an empty checks list instead of defaulting it", () => {
    expect(() => parseRequest({ ...load("generate_request.json"), checks: [] })).toThrow(/empty/);
  });

  it("keeps explicit checks", () => {
    expect(parseRequest({ ...load("generate_request.json"), checks: ["pnpm test"] }).checks).toEqual(["pnpm test"]);
  });
});

describe("generator result contract", () => {
  it("accepts the shared shipped fixture", () => {
    const r = parseResult(load("generate_result_shipped.json"));
    expect(r.status).toBe("shipped");
    expect(r.pr_url).toBe("https://github.com/o/r/pull/7");
    expect(r.usage).toBeNull();
  });

  it("refuses shipped with no PR: a run that shipped nothing shipped nothing", () => {
    expect(() => parseResult({ ...load("generate_result_shipped.json"), pr_url: null })).toThrow(/requires a pr_url/);
  });

  it("refuses refused with no reason", () => {
    expect(() => parseResult({ ...load("generate_result_shipped.json"), status: "refused", pr_url: null, refusal: null }))
      .toThrow(/requires a refusal/);
  });

  it("refuses an unknown status", () => {
    expect(() => parseResult({ ...load("generate_result_shipped.json"), status: "done" })).toThrow(/not one of/);
  });

  it("refuses usage that is not null: the generator makes no model call", () => {
    expect(() => parseResult({ ...load("generate_result_shipped.json"), usage: { input_tokens: 1 } }))
      .toThrow(/usage must be null/);
  });
});
