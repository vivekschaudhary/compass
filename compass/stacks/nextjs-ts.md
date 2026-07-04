---
name: nextjs-ts
display: Next.js + TypeScript (Vercel)
---

# Stack profile: Next.js + TypeScript (Vercel)

The delivery agents are stack-agnostic; this profile supplies the Next.js/TS specifics they verify. Injected into engineer / reviewer / security-reviewer / automation context at dispatch. (Extracted from the agent files in the stack-agnostic-core refactor — this is the prior built-in behavior, now pluggable.)

## Build & test commands
- **production build:** `pnpm build` (load-bearing — run before declaring done)
- **typecheck:** `pnpm typecheck` (or `tsc --noEmit`)
- **lint:** `pnpm lint`
- **unit / component tests:** `pnpm test`
- **E2E framework:** Playwright / Cypress — detected from `package.json`

**Orchestrator CI-parity check suite (#92):** the default commands the orchestrator runs in the worktree to verify a branch *before it opens the PR* — `pnpm install --frozen-lockfile · pnpm lint · pnpm typecheck · pnpm test · pnpm build`. Override to match your exact CI via `config.yaml` `checks:`.

## Production-build runtime-artifact inspection (`[mechanical-output-verification]`)
Inspect what actually runs, not just the process exit code — when runtime config is data-driven (manifests/bundle indexes written by the build), reading source ≠ reading runtime:
- **Next.js 16+:** `.next/server/functions-config-manifest.json` (middleware/proxy registration — a `/_middleware` entry with `runtime` + matchers), plus `routes-manifest.json`, `app-paths-manifest.json`, `prerender-manifest.json`.
- **Pre-v16 (Next 13–15):** legacy `.next/server/middleware-manifest.json` — **empty by design on 16.x**, so checking it alone gives false negatives on 16+; cross-check `functions-config-manifest.json`.
- **Vercel Functions:** `.vercel/output/functions/` — confirm declared functions exist.
- **Expo (native):** after `expo prebuild`, confirm Info.plist / AndroidManifest.xml / entitlements match `app.config.ts`.

## Framework runtime contracts (local-invisible — only enforced at prod runtime)
These compile and pass dev/tests but break on the deployed runtime. Verify against the build output, or flag as a DRI Risk with a prod-verification step:
- **`[rsc-prop-serialization]`** — Server→Client Component props must be JSON-serializable (or Server Actions). Functions, class instances, Promises cross the boundary invisibly in dev, break on Vercel.
- **`[server-action-file-export-purity]`** — `"use server"` files must export only `async` functions. Non-async exports compile locally, fail silently on the Vercel runtime.
- **`[empty-numeric-input-zero-trap]`** — `<input type="number">` delivers `0` when empty, not `""`/`undefined`. Validate empty vs. zero as explicitly distinct states.

## Conventions
- **Public/runtime config:** public-namespace env vars (`NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`, `VITE_*`) need explicit values for the target environment; dev defaults must fail loudly outside dev, never silently fall back.
- **Compiler-suppression to refuse** (without rationale): `@ts-ignore`, `@ts-expect-error`, `any`.

## Per-surface vertical test (`[per-surface-vertical-test]`)
For each data surface: a real vertical on a prod-like build — authenticate as a real user → **authorization-enforced queries (e.g. Supabase RLS)** → **render (e.g. RSC)**. Mocked auth, service-role/admin keys, and dev-server builds do NOT satisfy (anti-pattern `mocked-auth-green`).

## Stack-specific anti-patterns
`polished-but-broken` · `direct-import-test-suspicious` (a test imports a framework-discovered file directly so it passes even though the framework never registers it) · `[rsc-prop-serialization]` · `[server-action-file-export-purity]` · `[empty-numeric-input-zero-trap]`
