// Standalone parser check for the workspace doc-tree spec.
//
// The app has no test runner (package.json = dev/build/lint only), so this is a minimal node check
// run manually (`node scripts/test-doctree.mjs`). It mirrors the parse contract of
// readDefaultDocTree() in app/lib/doctree.ts against the REAL framework spec, so it validates the
// spec authoring + the table format. GAP (logged): it re-implements the regex rather than importing
// the TS function (no ts-execution in tests) — a proper app harness is a separate follow-up.

import { readFileSync } from "fs";
import { resolve } from "path";

const COMPASS_DIR = process.env.COMPASS_DIR || `${process.env.COMPASS_REPO || resolve(process.cwd(), "..")}/compass`;

function parseDocTree(md) {
  const section = md.split(/^##\s+/m).find((s) => /^nodes/i.test(s.trim())) ?? "";
  const nodes = [];
  for (const line of section.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    const c = t.split("|").slice(1, -1).map((x) => x.trim());
    if (c.length < 5 || !/^\d+$/.test(c[0])) continue;
    const kind = c[3] === "folder" || c[3] === "template" ? c[3] : "doc";
    nodes.push({ path: c[1], title: c[2], kind, parent: c[4] === "—" ? "" : c[4] });
  }
  return nodes;
}

let failed = 0;
const eq = (name, got, want) => { const ok = got === want; console.log(`${ok ? "✓" : "✗"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(want)})`}`); if (!ok) failed++; };

const md = readFileSync(`${COMPASS_DIR}/templates/doc-tree.md`, "utf8");
const nodes = parseDocTree(md);
const byPath = Object.fromEntries(nodes.map((n) => [n.path, n]));

eq("node count", nodes.length, 20);
eq("root '00-overview' kind", byPath["00-overview"]?.kind, "doc");
eq("root '00-overview' parent (empty)", byPath["00-overview"]?.parent, "");
eq("'02-scope/sow' title", byPath["02-scope/sow"]?.title, "SOW (source)");
eq("template node kind", byPath["05-cadence/sprint-reviews/template"]?.kind, "template");

// every non-root parent must reference an existing node
const orphans = nodes.filter((n) => n.parent && !byPath[n.parent]).map((n) => `${n.path}→${n.parent}`);
eq("no orphan parents", orphans.length, 0);
if (orphans.length) console.log("  orphans:", orphans);

// parents precede children (creation order)
const idx = Object.fromEntries(nodes.map((n, i) => [n.path, i]));
const outOfOrder = nodes.filter((n) => n.parent && idx[n.parent] > idx[n.path]).map((n) => n.path);
eq("parents precede children", outOfOrder.length, 0);

console.log(failed ? `\nFAILED (${failed})` : "\nOK — doc-tree spec parses to the expected structure");
process.exit(failed ? 1 : 0);
