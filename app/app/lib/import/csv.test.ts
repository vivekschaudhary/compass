import { describe, it, expect } from "vitest";
import { parseCsv, parseRecords, parseList, parseBool } from "./csv";

describe("parseCsv — what a spreadsheet actually exports", () => {
  it("strips a UTF-8 BOM, which Excel adds and which corrupts the first header", () => {
    const [header] = parseCsv("﻿code,label\na,b\n");
    expect(header[0]).toBe("code");
  });

  it("handles CRLF", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('code,hosts\nx,"claude,codex,gemini"\n')).toEqual([
      ["code", "hosts"],
      ["x", "claude,codex,gemini"],
    ]);
  });

  it('treats "" as an escaped quote', () => {
    expect(parseCsv('a\n"she said ""no"""\n')).toEqual([["a"], ['she said "no"']]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('text\n"line one\nline two"\n')).toEqual([["text"], ["line one\nline two"]]);
  });

  it("does not lose a final row with no trailing newline", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("keeps empty cells rather than collapsing them", () => {
    expect(parseCsv("a,b,c\n1,,3\n")).toEqual([["a", "b", "c"], ["1", "", "3"]]);
  });
});

describe("parseRecords", () => {
  it("keys by header, trims values, and lower-cases header names", () => {
    expect(parseRecords("Code, Label \n x , y \n")).toEqual([{ code: "x", label: "y" }]);
  });

  it("drops blank lines, which exports routinely carry", () => {
    expect(parseRecords("code\na\n\n\nb\n")).toEqual([{ code: "a" }, { code: "b" }]);
  });

  it("fills missing trailing columns rather than leaving them undefined", () => {
    expect(parseRecords("a,b,c\n1\n")).toEqual([{ a: "1", b: "", c: "" }]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseRecords("")).toEqual([]);
    expect(parseRecords("\n\n")).toEqual([]);
  });
});

describe("parseList and parseBool", () => {
  it("splits and trims a multi-value cell", () => {
    expect(parseList("claude, codex ,gemini")).toEqual(["claude", "codex", "gemini"]);
  });

  it("treats an empty cell as no values, not as one empty value", () => {
    expect(parseList("")).toEqual([]);
    expect(parseList(undefined)).toEqual([]);
  });

  it("reads the usual spellings of true", () => {
    for (const v of ["true", "TRUE", "yes", "1", "y"]) expect(parseBool(v)).toBe(true);
    for (const v of ["false", "no", "0", "nope"]) expect(parseBool(v)).toBe(false);
  });

  it("falls back on an empty cell, so an omitted column means the default", () => {
    expect(parseBool("", true)).toBe(true);
    expect(parseBool("", false)).toBe(false);
  });
});
