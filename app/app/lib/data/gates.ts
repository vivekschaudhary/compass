// Thin barrel. The implementation lives in `./gates/` — see its `index.ts` for why it is split
// and how the pieces fit. This file exists so every pre-existing `from "./gates"` /
// `from "@/app/lib/data/gates"` import, and every test's `vi.mock("./gates", ...)`, keeps working
// unchanged.
export * from "./gates/index";
