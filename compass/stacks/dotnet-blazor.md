---
name: dotnet-blazor
display: .NET + Blazor
---

# Stack profile: .NET + Blazor

The delivery agents are stack-agnostic; this profile supplies the .NET/Blazor specifics they verify. Injected into engineer / reviewer / security-reviewer / automation context at dispatch.

## Build & test commands
- **production build:** `dotnet build -c Release` (and `dotnet publish -c Release` for the deploy artifact) — load-bearing; run before declaring done.
- **restore:** `dotnet restore`
- **format / lint:** `dotnet format --verify-no-changes` (+ analyzer warnings; treat as errors if the project sets `TreatWarningsAsErrors`)
- **unit / component tests:** `dotnet test`
- **E2E / component framework:** detected from the **test `.csproj` `<PackageReference>`s** (there is NO `package.json`) — **bUnit** (Blazor component tests), **xUnit / NUnit / MSTest** (unit/integration), **Playwright for .NET / Selenium** (browser E2E).

## Production-build runtime-artifact inspection (`[mechanical-output-verification]`)
Inspect what actually runs, not just the exit code:
- **Compiled output:** `bin/Release/net*/<assembly>.dll` exists; verify referenced dependency versions in `*.deps.json`.
- **Blazor WebAssembly:** `wwwroot/_framework/blazor.boot.json` lists the assemblies actually shipped to the browser — confirm new components/assemblies are present (a component that compiles but isn't in the boot manifest never loads).
- **Blazor Server / hosted:** confirm component + DI + endpoint registration — `App.razor` routes, `Program.cs` `builder.Services` registrations, `app.MapRazorComponents<...>()` / SignalR hub mapping.
- **Render mode:** confirm the intended interactivity (Static SSR · InteractiveServer · InteractiveWebAssembly · Auto) is actually applied to the component (a `@rendermode` mismatch silently disables interactivity).

## Framework runtime contracts (local-invisible — only enforced at prod runtime)
Compile and pass dev/tests but break on the deployed runtime. Verify against the build output, or flag as a DRI Risk with a prod-verification step:
- **`[blazor-interop-serialization]`** — values crossing the JS↔.NET interop boundary (`IJSRuntime` calls, `[JSInvokable]` returns/args) must be JSON-serializable; non-serializable .NET types fail at runtime, not at compile.
- **`[prerender-hydration-state]`** — state captured during prerender must survive to the interactive render via `PersistentComponentState`; state recomputed/lost across the prerender→interactive boundary causes double-fetch or flicker, invisible until the prod render mode is active.
- **`[render-mode-mismatch]`** — a component assuming interactivity (event handlers, JS interop, timers) under Static SSR silently no-ops; confirm `@rendermode` matches the component's needs.

## Conventions
- **Public/runtime config:** `appsettings.json` / `appsettings.<Environment>.json` + environment variables (`ASPNETCORE_ENVIRONMENT`); no secrets in source — user-secrets locally, Key Vault / env in deployed environments. Dev defaults must fail loudly outside dev.
- **Compiler-suppression to refuse** (without rationale): `#pragma warning disable`, the null-forgiving `!` operator used to silence nullable warnings, blanket `<NoWarn>` in the csproj.

## Per-surface vertical test (`[per-surface-vertical-test]`)
For each data surface: a real vertical on a prod-like build — authenticate as a real user → **authorization-enforced data access (ASP.NET Core authorization policies · EF Core global query filters · DB row-level security)** → **render (the actual `@rendermode`)**. Mocked auth, the EF in-memory provider, and dev builds do NOT satisfy (anti-pattern `mocked-auth-green`).

## Stack-specific anti-patterns
`polished-but-broken` · `direct-import-test-suspicious` (a test references a component the app never registers, or that runs under the wrong render mode, so it passes while the feature never loads) · `[blazor-interop-serialization]` · `[prerender-hydration-state]` · `[render-mode-mismatch]`
