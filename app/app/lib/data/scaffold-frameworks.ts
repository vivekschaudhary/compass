// The closed list of frameworks the generator supports.
//
// Lives in `lib/data`, not `lib/agent`, even though `generate-contract.ts` (agent) is its main
// consumer: `scaffold-repos.ts` (data, the record parser) needs the same list, and `lib/data` must
// not import `lib/agent` — agent builds on data, not the reverse. One list, imported both ways.

export const FRAMEWORKS = ["nextjs-ts"] as const;
export type Framework = (typeof FRAMEWORKS)[number];
