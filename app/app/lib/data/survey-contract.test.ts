import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseSurveyRequest, parseSurveyResult, SurveyContractError } from "./survey-contract";

// The same fixtures the Python contract tests read. One file per shape, shared by both sides.
const FIXTURES = resolve(__dirname, "../../../../compass/orchestrator/tests/fixtures");
const load = (name: string) => JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8"));

describe("survey request contract", () => {
  it("accepts the shared fixture", () => {
    const r = parseSurveyRequest(load("survey_request.json"));
    expect(r.repos[0].key).toBe("api");
    expect(r.caller.kind).toBe("ts");
  });

  it("refuses no repos, a repeated key, a blank focus and a wrong version", () => {
    const d = load("survey_request.json");
    expect(() => parseSurveyRequest({ ...d, repos: [] })).toThrow(/repos/);
    expect(() => parseSurveyRequest({ ...d, repos: [...d.repos, ...d.repos] })).toThrow(/twice/);
    expect(() => parseSurveyRequest({ ...d, focus: " " })).toThrow(/focus/);
    expect(() => parseSurveyRequest({ ...d, version: 2 })).toThrow(SurveyContractError);
  });

  it("treats absent context as empty, but refuses a non-string", () => {
    const { context: _omit, ...without } = load("survey_request.json");
    expect(parseSurveyRequest(without).context).toBe("");
    expect(() => parseSurveyRequest({ ...without, context: 3 })).toThrow(/context must be a string/);
  });
});

describe("survey result contract", () => {
  it("accepts the shared fixture", () => {
    const r = parseSurveyResult(load("survey_result_surveyed.json"));
    expect(r.status).toBe("surveyed");
    expect(r.files_cited).toEqual(["src/auth.ts"]);
    expect(r.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
  });

  it("refuses a 'surveyed' result with no sections or no cited file", () => {
    const d = load("survey_result_surveyed.json");
    expect(() => parseSurveyResult({ ...d, sections: [] })).toThrow(/at least one section/);
    expect(() => parseSurveyResult({ ...d, files_cited: [] })).toThrow(/cited file/);
  });

  it("refuses a failure that gives no reason", () => {
    const d = load("survey_result_surveyed.json");
    expect(() => parseSurveyResult({ ...d, status: "survey_failed", sections: [], files_cited: [], refusal: null }))
      .toThrow(/requires a reason/);
  });

  it("refuses an unknown status", () => {
    expect(() => parseSurveyResult({ ...load("survey_result_surveyed.json"), status: "done" })).toThrow(/not one of/);
  });
});
