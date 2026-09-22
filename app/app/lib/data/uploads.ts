// A file a person uploads is READ into text, not passed along as a blob.
//
// The sibling of `links.ts`, and deliberately built the same way. That module exists because an
// agent turn cannot open a URL, so a link a human gives is read where the human's words are
// recorded. A file has the same problem and one worse: nothing downstream can read a PDF either —
// `document_section.body` is text, the gates read text, every citation points at text.
//
// So the rule is the same one, stated the same way: what can be read is read, and what cannot is
// REFUSED TO THE PERSON HOLDING IT, now, with the reason. The alternative is what would otherwise
// happen with a scanned contract — an empty document, filed, published, and passing every gate it
// has, because "no text" and "no problem" look identical once they reach the database.
//
// EXTRACTION IS LOCAL AND DETERMINISTIC. No model reads the file. `job.ts` states the reason next
// to `fileAnswer`: a summarised contract is the worst thing this system could hold, because
// everything downstream cites it and none of them can tell they are citing a summary. A library
// that transcribes is a different kind of thing from a model that reads and rewrites.

import "server-only";
import { htmlToMarkdown } from "./links";

/** Bigger than a contract, smaller than a video. Confluence's own attachment cap is near this. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * A ceiling on what gets FILED, separate from the byte cap.
 *
 * A 3 MB spreadsheet is a small file and a quarter of a million rows; rendering it into a document
 * nobody can read is not a useful outcome, and it would be pinned as an input to every downstream
 * row. Refused with its size rather than truncated: half a contract filed as if whole is the kind
 * of quiet wrongness this file exists to avoid.
 */
const MAX_CHARS = 500_000;

export type UploadRead =
  | { ok: true; text: string; kind: string; chars: number }
  | { ok: false; reason: string };

export type UploadedFile = { name: string; type?: string | null; bytes: ArrayBuffer };

/** The extension, lowercased, without the dot. `SOW.Final.PDF` → `pdf`. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

const bytesLabel = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/**
 * Formats that are a document to a person and a dead end to a parser, each answered with the thing
 * to do instead. A bare "unsupported file type" sends someone to ask which types ARE supported.
 */
const NO_READER: Record<string, string> = {
  doc: "`.doc` is the old binary Word format. Re-save it as `.docx` and upload that.",
  pages: "Pages files cannot be read here. Export it as `.docx` or `.pdf` and upload that.",
  key: "Keynote files cannot be read here. Export it as `.pdf` and upload that.",
  ppt: "PowerPoint files cannot be read here. Export it as `.pdf` and upload that.",
  pptx: "PowerPoint files cannot be read here. Export it as `.pdf` and upload that.",
  numbers: "Numbers files cannot be read here. Export it as `.xlsx` or `.csv` and upload that.",
};

/**
 * Read an uploaded file into the text that will be filed as the document.
 *
 * Dispatch is on the EXTENSION, not on the browser's declared MIME type. Browsers send
 * `application/octet-stream` for a `.docx` often enough that trusting the type would refuse real
 * contracts, and the extension is what the person can see and correct.
 */
export async function readUpload(file: UploadedFile): Promise<UploadRead> {
  const size = file.bytes.byteLength;
  if (size === 0) return { ok: false, reason: `\`${file.name}\` is empty — there is nothing to file.` };
  if (size > MAX_BYTES) {
    return {
      ok: false,
      reason:
        `\`${file.name}\` is ${bytesLabel(size)}, over the ${bytesLabel(MAX_BYTES)} limit. ` +
        `If it is a PDF of scanned pages, the text is what Compass needs — send that instead.`,
    };
  }

  const ext = extensionOf(file.name);
  if (NO_READER[ext]) return { ok: false, reason: NO_READER[ext] };

  let read: { text: string; kind: string };
  try {
    if (ext === "md" || ext === "markdown" || ext === "txt" || ext === "text") {
      read = { kind: "text", text: decodeText(file.bytes) };
    } else if (ext === "csv" || ext === "tsv") {
      read = { kind: "csv", text: decodeText(file.bytes) };
    } else if (ext === "docx") {
      read = { kind: "docx", text: await readDocx(file.bytes) };
    } else if (ext === "xlsx" || ext === "xlsm") {
      read = { kind: "xlsx", text: await readSheet(file.bytes) };
    } else if (ext === "pdf") {
      read = { kind: "pdf", text: await readPdf(file.bytes) };
    } else {
      return {
        ok: false,
        reason:
          `Compass cannot read \`${file.name}\`. It reads PDF, Word (\`.docx\`), Excel (\`.xlsx\`), ` +
          `and plain text (\`.md\`, \`.txt\`, \`.csv\`).`,
      };
    }
  } catch (e) {
    // What the library said, kept. "Could not read the file" sends someone to guess; "End of
    // central directory not found" tells them the upload truncated.
    return {
      ok: false,
      reason: `\`${file.name}\` could not be read: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const text = read.text.trim();

  // NOTHING CAME OUT. The case this whole file is careful about: a scan has pages, a size, and a
  // perfectly valid structure, and yields no text at all. Filed, it would publish an empty
  // contract and satisfy a `document is published` gate — a false green made of a real document.
  if (!text) {
    return {
      ok: false,
      reason:
        read.kind === "pdf"
          ? `\`${file.name}\` has no text in it — it is almost certainly a scan or images of pages. ` +
            `Compass files text, so an empty document would be filed and published instead. Send a ` +
            `PDF with selectable text, or paste the text.`
          : `\`${file.name}\` has no readable text in it.`,
    };
  }

  if (text.length > MAX_CHARS) {
    return {
      ok: false,
      reason:
        `\`${file.name}\` holds ${text.length.toLocaleString()} characters, over the ` +
        `${MAX_CHARS.toLocaleString()} limit for one document. Split it, or send the part that ` +
        `belongs at this path.`,
    };
  }

  return { ok: true, text, kind: read.kind, chars: text.length };
}

/** UTF-8, with the BOM removed — Excel writes one on every CSV it exports. */
function decodeText(bytes: ArrayBuffer): string {
  return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
}

/**
 * Word → markdown, through the same converter a web page goes through.
 *
 * `htmlToMarkdown` rather than a second TurndownService: it already turns an HTML table into a GFM
 * pipe table, and a contract's deliverables table flattening into a column of words is the exact
 * loss that made pasting unusable.
 */
async function readDocx(bytes: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
  return htmlToMarkdown(value);
}

/**
 * Every sheet, as its own markdown table under its own heading.
 *
 * A workbook is not one document and must not be filed as one blur: the sheet names are how a
 * person refers to the parts of it ("the milestones tab"), and they are the only headings this
 * document will have.
 */
async function readSheet(bytes: ArrayBuffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);

  const out: string[] = [];
  wb.eachSheet((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow((row) => {
      // `row.values` is 1-INDEXED — index 0 is always null. Slicing it is not cosmetic: kept, every
      // row would gain a leading empty cell and the header would no longer line up with the data.
      const values = (row.values as unknown[]).slice(1);
      rows.push(values.map(cellText));
    });
    if (!rows.length) return;

    const width = Math.max(...rows.map((r) => r.length));
    const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? "");
    const [header, ...body] = rows;

    out.push(
      `## ${sheet.name}`,
      "",
      `| ${pad(header).join(" | ")} |`,
      `|${" --- |".repeat(width)}`,
      ...body.map((r) => `| ${pad(r).join(" | ")} |`),
      "",
    );
  });

  return out.join("\n");
}

/**
 * One cell as text.
 *
 * Every branch here is a real shape exceljs returns, and getting any of them wrong fills a column
 * with `[object Object]`: a formula cell is `{ formula, result }`, a styled cell is
 * `{ richText: [...] }`, a link is `{ text, hyperlink }`, and a date is a `Date`.
 */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // The date, not the timestamp. A spreadsheet date is a day; rendering it as
    // `2026-10-31T00:00:00.000Z` says a precision the cell never had.
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((p) => p.text ?? "").join("");
    }
    // The RESULT of a formula, not the formula: the sheet's reader sees the number.
    if ("result" in o) return cellText(o.result);
    if ("text" in o) return cellText(o.text);
    if ("error" in o) return String(o.error);
  }
  // A pipe would end the cell and shift every column after it — the same corruption
  // `sprint-rows.ts` guards against, and this table is built for a parser-free reader either way.
  return String(v).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
}

/** The text layer of a PDF. No OCR: a scan comes back empty and is refused above, by name. */
async function readPdf(bytes: ArrayBuffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : text;
}
