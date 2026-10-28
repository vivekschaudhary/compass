import { describe, it, expect } from "vitest";
import { subjectKindOfOutputs, describeChoice } from "./subject-kinds";

describe("subjectKindOfOutputs", () => {
  it("a path naming {epic} is about an epic", () => {
    expect(subjectKindOfOutputs(["03-architecture/epic/{epic}", null])).toBe("epic");
  });
  it("a path naming {subject} (the build's `{subject}@scm`) is about a story", () => {
    expect(subjectKindOfOutputs(["{subject}@scm"])).toBe("story");
  });
  it("a workflow that covers its engagement is about nothing", () => {
    expect(subjectKindOfOutputs(["foundational-architecture", null, undefined])).toBeNull();
    expect(subjectKindOfOutputs([])).toBeNull();
  });
  it("{repo} is a fan-out kind but not something a person picks", () => {
    expect(subjectKindOfOutputs(["repos/{repo}"])).toBeNull();
  });
});

describe("describeChoice", () => {
  it("reads the same for every kind: key, title, detail", () => {
    expect(describeChoice({ ref: "E1", title: "Sign-in", ticketKey: "CT-288", detail: "5 stories" }))
      .toBe("CT-288 · Sign-in (5 stories)");
    expect(describeChoice({ ref: "S1", title: "Apple", ticketKey: "CT-359", detail: null }))
      .toBe("CT-359 · Apple");
  });
});
