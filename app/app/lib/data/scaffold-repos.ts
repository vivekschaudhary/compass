// The repos a scaffold record names, read from its Repositories table.
//
// Pure: no database. The materializer calls this on the approved record and creates nothing unless
// the whole table reads cleanly. A row that does not parse is a problem reported to the person, not a
// row skipped, because a skipped repo is a repo that quietly never gets scaffolded.

import { FRAMEWORKS } from "../agent/generate-contract";

export type ScaffoldRepo = { key: string; name: string; framework: string };

export type ScaffoldRepos = { repos: ScaffoldRepo[]; problems: string[] };

const KEY = /^[a-z0-9][a-z0-9-]*$/;

const cells = (line: string): string[] =>
  line.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

export function parseScaffoldRepos(markdown: string): ScaffoldRepos {
  const lines = markdown.split("\n").map((l) => l.trim());
  const start = lines.findIndex((l) => l.startsWith("|") && /\bkey\b/i.test(l) && /\bframework\b/i.test(l));
  if (start < 0) {
    return { repos: [], problems: ["The record has no Repositories table with `key` and `framework` columns."] };
  }

  const header = cells(lines[start]).map((h) => h.toLowerCase());
  const iKey = header.indexOf("key");
  const iName = header.indexOf("name");
  const iFramework = header.indexOf("framework");

  const repos: ScaffoldRepo[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();

  for (let j = start + 1; j < lines.length && lines[j].startsWith("|"); j++) {
    const c = cells(lines[j]);
    if (c.every((x) => /^-*$/.test(x))) continue; // the |---| rule
    const key = (c[iKey] ?? "").replace(/`/g, "").trim();
    const name = (iName >= 0 ? c[iName] ?? "" : "").trim();
    const framework = (c[iFramework] ?? "").replace(/`/g, "").trim();
    const where = `row ${j - start}`;

    if (!key) { problems.push(`${where}: no key.`); continue; }
    if (!KEY.test(key)) { problems.push(`${where}: key '${key}' must be lowercase letters, digits and hyphens.`); continue; }
    if (seen.has(key)) { problems.push(`${where}: key '${key}' is listed twice.`); continue; }
    if (!(FRAMEWORKS as readonly string[]).includes(framework)) {
      problems.push(`${where}: framework '${framework}' is not one of ${[...FRAMEWORKS].join(", ")}.`);
      continue;
    }
    seen.add(key);
    repos.push({ key, name: name || key, framework });
  }

  if (!repos.length && !problems.length) problems.push("The Repositories table lists no repos.");
  return { repos, problems };
}
