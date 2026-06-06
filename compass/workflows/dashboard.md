# Workflow: /dashboard

Generates a **single self-contained `docs/dashboard.html`** that renders all living Compass artifacts (foundation, plan, portfolio, scan reports, metrics, status) **AND** surfaces a 7th "Actions" tab with workflow-launcher buttons (orchestrator entry point per v0.4 spec target). Opens via `file://`. No server, no build toolchain. Shareable as an attachment.

**Why:** Markdown is great for git diffs, AI consumption, and engineers in the IDE. But stakeholders skim — PMs, leadership, on-call, anyone outside the IDE wants to open a URL or attach a file and see current state without spelunking `docs/bets/*/scan-report.md`. The dashboard is that view.

**Orchestrator entry point (v0.3.13):** The Actions tab makes the dashboard the **first concrete user-facing piece of the v0.4 Delivery Manager vision** (per v0.3.12 spec target). Solopreneur opens `docs/dashboard.html` in browser → sees project state + pending HITL gates + Finance summary + quick-action workflow launchers → clicks a launcher → command is copied to clipboard → user pastes into preferred web app (ChatGPT, Claude.ai) → Compass-aware AI runs the workflow → outputs commit back to repo → dashboard regenerates. **L1 (clipboard-copy) ships today.** L2 (`compass://` protocol handler + CLI for one-click execution) is deferred to v0.3.14. L3 (localhost server with real-time updates) is deferred indefinitely.

**How:** Compass workflows are already AI-driven. The "generator" is the AI agent following this workflow — no Node, no Python, no Pandoc. Read all the markdown reports, inline them verbatim into `<script type="text/markdown">` blocks inside the HTML template, write `docs/dashboard.html`. Browser-side, **marked.js + mermaid.js (CDN)** render the inlined content. CORS-safe because everything is inline; no `fetch()` of local files.

## Trigger

- `/dashboard` — manual full refresh
- Auto-invoked at the end of `/scan`, `/metrics`, `/plan`, `/status`

## State detection

| State                                          | Action                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `docs/foundation/product.md` missing           | **Refuse.** Nothing meaningful to dashboard yet — run `/setup-product` first. |
| `docs/foundation/product.md` exists            | Render available artifacts; show "not yet generated" placeholder for any missing section. |

## Process

1. **Verify gate:** `docs/foundation/product.md` exists (any status). If not, refuse with pointer to `/setup-product`.
2. **Load Delivery Manager agent** (`compass/agents/delivery-manager.md`) — Delivery Manager owns rolling visibility; dashboard fits the role. (Migrated + renamed v0.3.15; legacy role file at `compass/roles/project-manager.md` retained during v0.3.x grace period.)
3. **Discover source artifacts:**
   - **Foundation:** `docs/foundation/product.md`, `architecture.md`, `architecture-research.md` (if exists)
   - **Plan:** `docs/foundation/plan.md` (if exists)
   - **Portfolio:** `docs/foundation/portfolio.md` (if exists)
   - **Scan:** all `docs/bets/*/scan-report.md`
   - **Metrics:** for each bet, the **most recent** `docs/metrics/<bet-id>-*.md` snapshot (sort by date in filename)
   - **Status:** `docs/status.md`
4. **Read project name** from the foundation product bet (first H1 or `id:` frontmatter).
5. **Load template** at `compass/templates/dashboard.html.template`.
6. **Fill the COMPASS-INSERT markers:**
   - `<!-- COMPASS-INSERT:project-name -->` → project name (HTML-escape)
   - `<!-- COMPASS-INSERT:timestamp -->` → today's date + UTC time (e.g., `2026-05-24 14:32 UTC`)
   - `<!-- COMPASS-INSERT:foundation-blocks -->` → one `<article class="artifact-block">` per foundation file (see Block shape below)
   - `<!-- COMPASS-INSERT:plan-block -->` → single artifact-block OR empty-tab message
   - `<!-- COMPASS-INSERT:portfolio-block -->` → single artifact-block OR empty-tab message
   - `<!-- COMPASS-INSERT:scan-blocks -->` → one artifact-block per bet, sorted by bet ID. Sub-heading per bet with title from the bet's brief.
   - `<!-- COMPASS-INSERT:metrics-blocks -->` → one artifact-block per bet (latest snapshot only)
   - `<!-- COMPASS-INSERT:status-block -->` → single artifact-block OR empty-tab message
7. **Inline markdown verbatim — byte-for-byte from source. This is load-bearing.**
   - Do NOT pre-render to HTML — marked.js does that client-side.
   - **Do NOT summarize.** Not "executive summaries of the larger sections." Not "key points only." Not "DRI log entries condensed." Not "abbreviated for readability."
   - **Do NOT truncate.** Not even with `...[truncated, see source]` markers.
   - **Do NOT reword for clarity**, even if the source markdown reads awkwardly.

   **Why this is non-negotiable:** the dashboard's only value is being a *faithful view* of the underlying markdown. The moment summaries enter, the dashboard becomes a second source of truth — it drifts from source, stakeholders read it instead of the real artifacts, and the markdown's careful structure (DRI entries, per-row pillar evaluations, complete alternatives tables, full citation lists) gets quietly lost in translation. The dashboard is **allowed** to be 200-300 KB. Browsers handle it. If a project genuinely outgrows that, the answer is `/dashboard --summary` as an explicit opt-in mode (deferred, not yet implemented) — never silent summarization.

   Inline format:
   ```html
   <article class="artifact-block">
     <div class="artifact-path">docs/bets/PROJ-42/scan-report.md</div>
     <script type="text/markdown" data-artifact="docs/bets/PROJ-42/scan-report.md">
   <!-- full markdown content here, verbatim, byte-for-byte from source, including frontmatter (which marked.js will treat as a horizontal-rule + code block — that's fine; it makes the metadata visible) -->
     </script>
     <div class="rendered"></div>
   </article>
   ```
   *One critical detail:* if the markdown contains `</script>` anywhere (rare, but possible in code examples), escape it as `<\/script>` to avoid breaking the HTML parser. This is the **only** transformation permitted on the source content.
8. **Populate the Actions block** (orchestrator entry point per v0.3.13). Generate HTML for `<!-- COMPASS-INSERT:actions-block -->` with up to 4 sub-sections (rendered in this order, sections omitted when empty):

   **8a. Project state summary** (always shown — top of the Actions tab):

   Emit a brief paragraph describing where the project is. Compute from artifact existence + statuses:

   - **Empty project** (no `docs/foundation/product.md`): "**No foundation yet.** Start with `/setup-product`." — and skip directly to a single highlighted launcher row containing only `/setup-product`. Omit sections 8b–8d.
   - **Foundation product approved, no architecture:** "**Product foundation approved.** Next: `/setup-foundation-architecture`."
   - **Foundation approved, no portfolio:** "**Foundations approved.** Next: `/create-bet-portfolio` (bootstrap MVP wedge) or `/create-brief <id>` (single bet)."
   - **Portfolio approved, bets in flight:** "**N bets in flight.**" + bullet list per bet showing bet-id + current phase (from brief's `status` and presence of architecture / stories).
   - **All bets shipped:** "**All bets shipped.** `/measure` per cron; `/metrics` for outcomes view."

   Shape:
   ```html
   <div class="action-section project-state">
     <p>... state summary ...</p>
   </div>
   ```

   **8b. Pending HITL gates** (omit section entirely if none): scan all bet artifacts (`docs/foundation/product.md`, `docs/foundation/architecture.md`, `docs/foundation/portfolio.md`, `docs/bets/*/brief.md`, `docs/bets/*/architecture.md`, `docs/bets/*/stories/*.md`) for frontmatter `status: proposed`. Each surfaces as:

   ```html
   <div class="action-section">
     <h2>Pending approvals (HITL gates)</h2>
     <div class="hitl-gate">
       <div><strong>Brief awaiting approval:</strong> CB-2 — Mobile dashboard</div>
       <div class="path">docs/bets/CB-2/brief.md</div>
     </div>
     <div class="hitl-gate">
       <div><strong>Architecture awaiting approval:</strong> CB-3</div>
       <div class="path">docs/bets/CB-3/architecture.md</div>
     </div>
     <p class="action-help">Approve by editing the file's <code>status:</code> frontmatter to <code>approved</code> and committing. L1 surfaces visibility; L2 (v0.3.14) will add one-click approval buttons.</p>
   </div>
   ```

   **8c. Quick-action workflow launchers** (always shown — main orchestrator surface). Group actions semantically; show only relevant groups for project state. Each launcher is a `<button class="action-btn" onclick="compassCopy('/<workflow>', this)">Label <span class="cmd">/&lt;workflow&gt;</span></button>`. The `compassCopy` JS handler is defined in the template (v0.3.13); it writes the command to clipboard + shows visual feedback.

   Recommended groups (omit entire group when irrelevant for project state):

   ```html
   <div class="action-section">
     <h2>Actions</h2>

     <!-- Bootstrap (only shown when foundation incomplete) -->
     <div class="action-row">
       <span class="label">Bootstrap</span>
       <button class="action-btn" onclick="compassCopy('/setup-product', this)">Start product foundation <span class="cmd">/setup-product</span></button>
       <button class="action-btn" onclick="compassCopy('/setup-foundation-architecture', this)">Start architecture foundation <span class="cmd">/setup-foundation-architecture</span></button>
       <button class="action-btn" onclick="compassCopy('/create-bet-portfolio', this)">MVP bet portfolio <span class="cmd">/create-bet-portfolio</span></button>
     </div>

     <!-- Create or refine a bet (shown post-portfolio-approval) -->
     <div class="action-row">
       <span class="label">Create or refine a bet</span>
       <button class="action-btn" onclick="compassCopy('/create-brief', this)">New bet brief <span class="cmd">/create-brief</span></button>
       <button class="action-btn" onclick="compassCopy('/create-bet-architecture', this)">Bet architecture <span class="cmd">/create-bet-architecture</span></button>
       <button class="action-btn" onclick="compassCopy('/create-story', this)">Create story <span class="cmd">/create-story</span></button>
     </div>

     <!-- Build &amp; ship (shown when ready stories or bets exist) -->
     <div class="action-row">
       <span class="label">Build &amp; ship</span>
       <button class="action-btn" onclick="compassCopy('/build', this)">Build story <span class="cmd">/build &lt;story-id&gt;</span></button>
       <button class="action-btn" onclick="compassCopy('/fix', this)">Fix bug <span class="cmd">/fix</span></button>
       <button class="action-btn" onclick="compassCopy('/triage', this)">Triage incident <span class="cmd">/triage</span></button>
       <button class="action-btn" onclick="compassCopy('/ops', this)">Ops change <span class="cmd">/ops</span></button>
     </div>

     <!-- Observe &amp; report (always shown post-foundation) -->
     <div class="action-row">
       <span class="label">Observe &amp; report</span>
       <button class="action-btn" onclick="compassCopy('/status', this)">Refresh status <span class="cmd">/status</span></button>
       <button class="action-btn" onclick="compassCopy('/scan', this)">Run scanner <span class="cmd">/scan &lt;bet-id&gt;</span></button>
       <button class="action-btn" onclick="compassCopy('/plan', this)">Refresh plan <span class="cmd">/plan</span></button>
       <button class="action-btn" onclick="compassCopy('/metrics', this)">Update metrics <span class="cmd">/metrics</span></button>
     </div>

     <p class="action-help">Click any action → command is copied to clipboard → paste into ChatGPT / Claude.ai / your preferred Compass-aware AI surface → workflow runs there and commits back to the repo. The dashboard regenerates next time you run <code>/dashboard</code> (or auto-refreshes via <code>/scan</code> / <code>/plan</code> / <code>/status</code> / <code>/metrics</code>).</p>
   </div>
   ```

   For each story in `status: ready`, the `/build <story-id>` placeholder can be templated with the actual ID (e.g., `compassCopy('/build CB-2-1', this)`). Same for `/scan <bet-id>` and `/create-bet-architecture <bet-id>` etc. — replace the placeholder with the most relevant in-flight identifier when computable; otherwise leave the placeholder.

   **8d. Finance summary** (omit section entirely if `docs/usage/current.json` does NOT exist — do not fake numbers): read the JSON, render as:

   ```html
   <div class="action-section">
     <h2>This period's cost</h2>
     <div class="finance-summary">
       <div>PM (OpenAI)</div><div>$4.20</div>
       <div>Researcher (Gemini)</div><div>$2.10</div>
       <div>Engineer (Claude Code)</div><div>$12.50</div>
       <div>Reviewer (Codex)</div><div>$3.80</div>
       <div class="total">Total</div><div class="total">$22.60</div>
     </div>
     <p class="action-help">Costs aggregated from per-host session logs. Full breakdown in <code>docs/usage/</code>. L1 shows the rollup; v0.4 Delivery Manager will use this for Finance-leg budget enforcement.</p>
   </div>
   ```

   **Why clipboard-copy (L1) instead of one-click execution:** the dashboard is a static `file://` page. Buttons can't directly invoke workflows. Clipboard-copy bridges the gap — solopreneur pastes the command into ChatGPT, Claude.ai, or any Compass-aware AI surface where the actual workflow runs. L2 (v0.3.14) will add `compass://` URL handler + a small Compass CLI that registers the protocol — buttons become one-click execution. Same dashboard; same buttons; less friction.

9. **Empty-tab fallback** — for any tab where no source files exist, emit:
   ```html
   <div class="empty-tab">No <name> artifacts yet. Run <code>/<command></code> to generate.</div>
   ```
10. **Write `docs/dashboard.html`** with the Write tool.
11. **Output summary in chat:**
    - File path
    - Count of inlined artifacts (per tab)
    - File size
    - Opening instruction:
      - macOS: `open docs/dashboard.html`
      - Linux: `xdg-open docs/dashboard.html`
      - Windows: `start docs/dashboard.html`
12. **No HITL gate** — dashboard is a living artifact, refreshed on demand. Same shape as `plan.md` and `scan-report.md`.

## Block shape (canonical)

Every inlined artifact follows this shape:

```html
<article class="artifact-block">
  <div class="artifact-path"><source file path></div>
  <script type="text/markdown" data-artifact="<source file path>">
<markdown content, verbatim, with </script> escaped as <\/script>>
  </script>
  <div class="rendered"></div>
</article>
```

The `<div class="rendered"></div>` is where marked.js writes the rendered HTML (client-side, on tab activation). Don't pre-fill it.

## Verification (mandatory)

- [ ] `docs/dashboard.html` exists
- [ ] Every available source artifact is inlined as `<script type="text/markdown" data-artifact="<path>">…</script>` with the source path preserved
- [ ] **Every inlined artifact's content matches its source file byte-for-byte.** No summarization, no executive summaries, no truncation, no rewording. Spot-check by `diff`-ing 2-3 inlined blocks against their source `.md` files (excluding whitespace at the `<script>` block boundary). The **only** permitted transformation is escaping `</script>` → `<\/script>` inside the inlined content.
- [ ] Marked.js + Mermaid.js CDN `<script>` tags present in `<head>`
- [ ] Tab navigation present with all seven tabs (v0.3.13): **Actions** / Foundation / Plan / Portfolio / Scan / Metrics / Status — Actions tab is the default initially-active tab
- [ ] **Actions tab** present with `<!-- COMPASS-INSERT:actions-block -->` marker filled in (not literal marker text remaining)
- [ ] **Actions tab** contains at least one workflow-launcher `<button class="action-btn" onclick="compassCopy('/...', this)">` (minimum: `/setup-product` for empty projects; full action grid for post-foundation projects)
- [ ] **Clipboard-copy JS** present in `<script>` block: `compassCopy` function defined and uses `navigator.clipboard.writeText`
- [ ] **Project state summary** at top of Actions tab matches actual project state (empty / foundation-only / portfolio-approved / bets-in-flight / all-shipped)
- [ ] **Pending HITL gates** section appears IFF at least one artifact has `status: proposed` in its frontmatter; section omitted entirely when none pending
- [ ] **Finance summary** section appears IFF `docs/usage/current.json` exists; section omitted entirely when missing (no fabricated numbers)
- [ ] "Last generated" timestamp visible at top of page
- [ ] Footer note about re-running `/dashboard` present
- [ ] Empty tabs show empty-tab message (not blank, not error)
- [ ] `</script>` inside any inlined markdown is escaped to `<\/script>` (HTML parser would otherwise break)
- [ ] Mermaid `flowchart` / `erDiagram` / `gantt` blocks in the inlined markdown remain as ` ```mermaid` fences (marked + the page script turn them into `<div class="mermaid">` and run mermaid.js)
- [ ] No HTML or JS console errors when opened in browser (smoke test)

## Output

- `docs/dashboard.html` — single self-contained HTML file, openable via `file://`. Shareable as an attachment. Auto-refreshed by other workflows.
- **Gitignored by convention.** `docs/dashboard.html` is a *derived view* — every `/scan`, `/plan`, `/metrics`, `/status` rewrites it, producing large diffs that aren't human-meaningful (the source-of-truth diff is in the underlying markdown). The framework's root `.gitignore` excludes it. Consuming projects should add the same line to their own `.gitignore` (see `SETUP.md`). Other living artifacts (`plan.md`, `scan-report.md`, metrics snapshots, `status.md`) DO get committed — they carry user-relevant state (suppressions, refinement log, history). The dashboard doesn't.

## Refusal cases

- `docs/foundation/product.md` missing — pointer to `/setup-product`.

## Notes

- **Living artifact.** Like `plan.md` and `scan-report.md`, this is regenerated each run. Hand-editing `docs/dashboard.html` is anti-pattern — the next `/dashboard` run overwrites.
- **Silent summarization is the failure mode.** If the generating agent chooses to "summarize larger artifacts to keep file size manageable," that's a **spec violation, not an optimization**. The dashboard is allowed to be 200-300 KB. Browsers handle it. The framing "small file is reviewable, large file isn't" is an invented constraint — reviewers don't read `dashboard.html` (it's gitignored). Stakeholders open it in a browser, where size is a non-issue. If a project genuinely outgrows 300 KB (30+ bets, hundreds of artifacts), the answer is `/dashboard --summary` as an explicit opt-in mode (deferred, not yet implemented). Filing the size gap as a future enhancement is fine; quietly summarizing is not.
- **Inlined, not fetched.** Browsers block `fetch()` over `file://` due to CORS. Inlining markdown into `<script type="text/markdown">` blocks at generation time keeps the dashboard zero-server.
- **CDN dependencies.** Marked.js + Mermaid.js loaded via jsDelivr. Total runtime page weight ~600KB gzipped. Works offline only if dependencies cached; first open requires internet.
- **Future: `--publish` mode.** If hosted (Confluence / Notion / GitHub Pages) becomes useful, add `/dashboard --publish <target>` that pushes via MCP. Deferred until asked.
- **Future: real generator.** At Compass project scale beyond ~30 bets, the inlined HTML may grow large. A small Node/Python script generator can replace AI-driven generation. Deferred until needed.
