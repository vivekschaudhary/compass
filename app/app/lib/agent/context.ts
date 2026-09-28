// Thin barrel. The implementation lives in `./context/` — see its `index.ts` for why it is split
// and how the pieces fit. This file exists so every pre-existing `from "./context"` /
// `from "@/app/lib/agent/context"` import keeps working unchanged.
export * from "./context/index";
