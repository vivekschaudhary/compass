// Thin barrel. The implementation lives in `./phases/` — see its `index.ts` for why it is split
// and how the pieces fit. This file exists so every pre-existing `from "./phases"` /
// `from "@/app/lib/data/phases"` import keeps working unchanged.
export * from "./phases/index";
