# Compass — Control-Tower App

The Next.js 16 / Supabase control-tower UI for Compass. This is the **app half** of the Compass
monorepo:

- **`/` (repo root)** — the Compass **framework**: the Python orchestrator (`compass.orchestrator`),
  `compass/agents/`, `compass/workflows/`, templates, docs. This is what consumer projects vendor.
- **`/app`** — this app. It *drives* the framework: it shells into
  `python -m compass.orchestrator.run` and reads specs (e.g. `sprint-0.md`) out of the framework's
  `compass/` dir.

The app resolves the framework root relative to its own working directory (`<repo>/app` → `<repo>`),
so it isn't pinned to any one machine. Set `COMPASS_REPO` / `COMPASS_DIR` to override (see
[app/lib/repo.ts](app/lib/repo.ts) and [app/api/intake/route.ts](app/api/intake/route.ts)).

## Getting started

```bash
cd app
npm install          # first time
cp .env.example .env.local   # then fill in the values below
npm run dev          # http://localhost:3000
```

### Required env (`app/.env.local`)

| Key | For |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase (engagements, backlog, docs, metrics) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | SOW extraction + assistant |
| `ATLASSIAN_*`, `JIRA_PROJECT`, `GRAPH_*` | Jira / Confluence / Graph connectors |
| `COMPASS_REPO` *(optional)* | Override the framework root; defaults to the repo root above `app/` |

## Scripts

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build
- `npm run lint` — eslint
