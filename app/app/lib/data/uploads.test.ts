import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Reading a file a person uploaded.
//
// The real libraries run against real files — a PDF, a Word document with a genuine table, a
// workbook — because the thing under test is whether a client's contract survives the trip into
// `document_section.body`. A mocked extractor would assert that the code calls a function.
//
// The fixtures are tiny and committed beside this file. `scanned.pdf` is a real image-only PDF, and
// it is the most important one here: it is a valid document of a plausible size that yields no text
// at all, which is the shape of the failure that would otherwise file an empty contract and pass
// its gate.

vi.mock("server-only", () => ({}));

const { readUpload } = await import("./uploads");

const FIXTURES = join(import.meta.dirname, "fixtures");

async function upload(name: string) {
  const buf = await readFile(join(FIXTURES, name));
  // A fresh ArrayBuffer, not `buf.buffer` — Node pools small Buffers, so `buf.buffer` is the whole
  // pool and every file would arrive megabytes long.
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return readUpload({ name, bytes });
}

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("reading a PDF", () => {
  it("files the text, verbatim", async () => {
    const r = await upload("sow.pdf");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.kind).toBe("pdf");
    expect(r.text).toContain("Statement of Work");
    expect(r.text).toContain("The supplier will deliver a wealth platform.");
    expect(r.text).toContain("Discovery ends 2026-10-31.");
  });

  // THE ONE THAT MATTERS. A scan is a valid PDF with pages and a size; every check but this one
  // passes on it. Filed, it publishes an empty contract and satisfies "the document is published".
  it("refuses a scan by name rather than filing an empty document", async () => {
    const r = await upload("scanned.pdf");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("scanned.pdf");
    expect(r.reason).toContain("no text");
    expect(r.reason).toMatch(/scan/i);
  });
});

describe("reading a Word document", () => {
  it("keeps a table as a table", async () => {
    // The reason uploading exists at all: pasting a contract flattens its deliverables table into a
    // column of words, and everything downstream cites that.
    const r = await upload("deliverables.docx");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.kind).toBe("docx");
    expect(r.text).toContain("| Deliverable | Due | Owner |");
    expect(r.text).toContain("| Discovery report | 2026-10-31 | Supplier |");
  });

  it("keeps the headings", async () => {
    const r = await upload("deliverables.docx");
    expect(r.ok && r.text).toContain("# Statement of Work");
  });

  it("reads a plain Word document too", async () => {
    const r = await upload("sow.docx");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain("The supplier will deliver a wealth platform.");
  });
});

describe("reading a spreadsheet", () => {
  it("renders every sheet as its own table under its own heading", async () => {
    const r = await upload("milestones.xlsx");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.kind).toBe("xlsx");
    expect(r.text).toContain("## Milestones");
    expect(r.text).toContain("| Milestone | Date | Owner |");
  });

  it("renders a date cell as the day, not a timestamp", async () => {
    // A spreadsheet date is a day. `2026-10-31T00:00:00.000Z` claims a precision the cell never had.
    const r = await upload("milestones.xlsx");
    expect(r.ok && r.text).toContain("| Discovery ends | 2026-10-31 | Joe |");
    expect(r.ok && r.text).not.toContain("T00:00:00");
  });

  it("does not leave [object Object] in a cell", async () => {
    // Every exceljs cell shape that is not a string — formula, rich text, hyperlink — stringifies
    // to that, and it would be filed as the client's data.
    const r = await upload("milestones.xlsx");
    expect(r.ok && r.text).not.toContain("[object Object]");
  });
});

describe("plain text", () => {
  it("files markdown as it is", async () => {
    const r = await readUpload({ name: "notes.md", bytes: bytes("# Notes\n\nLine two.") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.kind).toBe("text");
    expect(r.text).toBe("# Notes\n\nLine two.");
  });

  it("strips the BOM Excel writes on every CSV it exports", async () => {
    const r = await readUpload({ name: "rows.csv", bytes: bytes("﻿a,b\n1,2") });
    expect(r.ok && r.text.startsWith("a,b")).toBe(true);
  });
});

describe("what it refuses, and how it says so", () => {
  it("names the thing to do for an old .doc", async () => {
    const r = await readUpload({ name: "contract.doc", bytes: bytes("x") });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain(".docx");
  });

  it("lists what it can read when it cannot read the extension", async () => {
    const r = await readUpload({ name: "archive.zip", bytes: bytes("x") });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("archive.zip");
    expect(r.reason).toContain(".docx");
    expect(r.reason).toContain(".xlsx");
  });

  it("refuses an empty file rather than filing an empty document", async () => {
    const r = await readUpload({ name: "empty.txt", bytes: new ArrayBuffer(0) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("nothing to file");
  });

  it("refuses a file over the size cap, saying how big it is", async () => {
    const r = await readUpload({ name: "huge.pdf", bytes: new ArrayBuffer(11 * 1024 * 1024) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("11.0 MB");
  });

  // A corrupt file must come back with what the library said, not a shrug: "End of central
  // directory not found" tells someone the upload truncated.
  it("keeps what the library said when a file will not parse", async () => {
    const r = await readUpload({ name: "broken.docx", bytes: bytes("not a zip at all") });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("broken.docx");
    expect(r.reason).toContain("could not be read");
  });

  it("refuses a document past the character ceiling instead of truncating it", async () => {
    const r = await readUpload({ name: "long.txt", bytes: bytes("x".repeat(500_001)) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("500,001");
  });

  it("judges by extension, not by the type the browser claims", async () => {
    // Browsers send `application/octet-stream` for a .docx often enough that trusting the type
    // would refuse real contracts.
    const r = await upload("sow.docx");
    expect(r.ok).toBe(true);
  });
});
