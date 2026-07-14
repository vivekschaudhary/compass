// Types + the seed FIXTURE (one cross-functional scrum team). Used as-is until Supabase is
// configured + seeded, then getProgram() reads the DB and returns the same shape.

export type Health = "good" | "warn" | "bad" | "idle";

export const HEALTH_LABEL: Record<Health, string> = {
  good: "On track",
  warn: "At risk",
  bad: "Breach",
  idle: "Not started",
};

export type Program = {
  name: string;
  sow: string;
  client: string;
  pricing: string;
  budget: number;
  months: number;
  qualityBar: string;
  phase: string;
  overall: Health;
};

export type Pillar = {
  key: "cost" | "scope" | "time" | "quality";
  label: string;
  status: Health;
  headline: string;
  sub: string;
  pct: number;
  spark: number[];
};

export type Attention = {
  id: string;
  pillar: Pillar["key"];
  title: string;
  detail: string;
  actions: string[];
  tone: "warn" | "bad";
};

export const phases = ["Discovery", "Build", "QA", "Launch"] as const;
export type Phase = (typeof phases)[number];

export type Epic = {
  key: string;
  title: string;
  status: Health;
  assignee: string;
  deliverable: string;
  note?: string;
};

export type Lane = { discipline: string; cells: Partial<Record<Phase, Epic[]>> };

export type Role = { id: string; name: string; title: string; initials: string; roleCode: string };

// The canonical Compass agent roles (compass/agents/*.md) — the single source of truth for the
// team role dropdown, the switcher sort order, and job routing.
export const COMPASS_ROLES: { code: string; label: string }[] = [
  { code: "delivery-manager", label: "Delivery Manager" },
  { code: "pm", label: "Product Manager" },
  { code: "product-owner", label: "Product Owner" },
  { code: "researcher", label: "Researcher" },
  { code: "enterprise-architect", label: "Enterprise Architect" },
  { code: "architect", label: "Architect" },
  { code: "designer", label: "Designer" },
  { code: "ux-writer", label: "UX Writer" },
  { code: "engineer", label: "Engineer" },
  { code: "automation", label: "Automation (QA)" },
  { code: "reviewer", label: "Reviewer" },
  { code: "security-reviewer", label: "Security Reviewer" },
  { code: "scanner", label: "Scanner" },
  { code: "tech-writer", label: "Tech Writer" },
  { code: "support", label: "Support" },
  { code: "gtm", label: "GTM" },
  { code: "sre", label: "SRE (DevOps)" },
];
// A team member as edited in engagement settings (the roster behind the role views).
export type TeamMember = {
  id: string; role: string; name: string; initials: string; title: string;
  start_date: string; end_date: string; comments: string;
};

export type FailedRun = {
  runId: string;
  role: string;
  story: string;
  failedStep: string;
  error: string;
  diagnosis: string;
  fix: string;
  resumeFrom: string;
};

export type JobKind = "review" | "approve" | "deliver" | "blocked" | "drafting" | "build";
export type Job = {
  id: string;
  role: string; // pm | eng | qa | design | exec
  kind: JobKind;
  title: string;
  subtitle: string;
  meta?: string; // e.g. "AI-decomposed · 1 flagged"
  related?: string; // jira key / deliverable
  primary?: string; // primary action label
  secondary?: string; // secondary action label
  tone?: "default" | "warn" | "bad";
};

export type EngagementRef = { id: string; name: string; sow: string };

export type RepoArea = "frontend" | "backend" | "qa-automation" | "infra" | "mobile" | "shared";
export type RepoRef = {
  id: string; key: string; name: string; url: string; area: RepoArea;
  default_branch: string; local_path: string; build_cmd: string; test_cmd: string;
};
export type DocsProvider = "confluence" | "teams";
export type Connectors = {
  figma_url: string;
  docs_provider: DocsProvider;
  // Confluence
  confluence_space: string; confluence_root_page_id: string;
  atlassian_base_url: string; atlassian_email: string;
  // Teams / SharePoint — site + Azure AD app (non-secret ids)
  teams_site: string; // "host:/sites/Name", a webUrl, or a site id
  graph_tenant_id: string; graph_client_id: string;
  jira_project: string; jira_board_id: string;
  // write-only secrets never leave the server — the UI only learns whether one is set
  has_atlassian_token: boolean; has_graph_secret: boolean;
};
// POST payload from Settings may additionally carry raw secrets (blank = keep existing).
export type ConnectorsInput = Connectors & { atlassian_api_token?: string; graph_client_secret?: string };

export type ProgramModel = {
  program: Program;
  pillars: Pillar[];
  attention: Attention[];
  lanes: Lane[];
  discoveryDone: string[];
  roles: Role[];
  jobs: Job[];
  failedRun: FailedRun;
  engagements: EngagementRef[];
  activeEngagementId: string;
  connectors: Connectors;
  repos: RepoRef[];
  deliverables: { code: string; title: string; status: string }[];
  epics: { id: string; title: string; discipline: string; stories: number; research: string }[];
  storyList: StorySummary[]; // the epics' stories with their owning role — drives per-role ticket pickers
  activity: Activity[];
  metrics: Metric[];
  atlassianBase: string; // effective Atlassian base URL (per-engagement → env) for deep links
};

// A story surfaced to the client so a role can pick its own labeled tickets to run a workflow on.
export type StorySummary = { id: string; epicId: string; title: string; role: string | null; status: string };

// Workflow keys the generic runner (/api/workflow) can execute → their human label. Client-safe
// mirror of WORKFLOW_SPECS in app/api/workflow/route.ts (keep the keys in sync). These flip their
// ROLE_WORKFLOWS entry to "ready" and run through the per-role ticket picker.
export const GENERIC_WORKFLOWS: Record<string, string> = {
  "design-spec": "Design spec", "copy": "UX copy", "tech-design": "Tech design", "bet-architecture": "Epic architecture",
  "launch-plan": "Launch plan", "release-comms": "Release comms", "execute-change": "Change plan",
  "e2e": "E2E test plan", "review-pr": "PR review", "scan": "Security scan", "docs": "Docs update",
  "runbook": "Runbook", "status": "Status roll-up",
};
// A completed task in the history — logged per role + actor.
export type Activity = { id: number; role: string; actor: string; kind: string; title: string; related: string; status: string; created_at: string; run_id: string | null };
// A metric definition, captured per project (epicId null) or per epic (bet outcome). Value empty until instrumented.
export type Metric = { id: string; epicId: string | null; scope: string; category: string; name: string; target: string; value: string };

// ── The seed: Acme Customer Portal, one cross-functional scrum team ────────
export const FIXTURE: ProgramModel = {
  program: {
    name: "Acme Customer Portal",
    sow: "SOW-2041",
    client: "Acme Corp",
    pricing: "Fixed-bid",
    budget: 480_000,
    months: 6,
    qualityBar: "WCAG 2.1 AA · 99.9% uptime",
    phase: "Build · Phase 2 of 4",
    overall: "warn",
  },
  pillars: [
    { key: "cost", label: "Cost", status: "good", headline: "$172k", sub: "of $480k · 36% burned · on curve", pct: 36, spark: [8, 15, 21, 26, 30, 34, 36] },
    { key: "scope", label: "Scope", status: "warn", headline: "5 / 5", sub: "deliverables grounded · 1 crossing pending", pct: 100, spark: [40, 55, 70, 80, 88, 95, 100] },
    { key: "time", label: "Time", status: "warn", headline: "M2 in 6d", sub: "milestone at risk · 2 stories late", pct: 58, spark: [10, 22, 33, 41, 48, 54, 58] },
    { key: "quality", label: "Quality", status: "good", headline: "94%", sub: "AC pass · 0 criticals open", pct: 94, spark: [76, 82, 85, 88, 90, 92, 94] },
  ],
  attention: [
    { id: "a1", pillar: "time", title: "D3 Dashboard — KAN-112 blocked 3 days", detail: "Waiting on the design sub-task (Alex) — 2 days overdue. Puts milestone M2 at risk.", actions: ["See detail", "Nudge Alex"], tone: "warn" },
    { id: "a2", pillar: "scope", title: "“CSV export” requested — not in SOW-2041", detail: "Client asked mid-sprint. Grounds to no deliverable. Fixed-bid: blocked until a change request is approved.", actions: ["Raise change request", "Map to a deliverable"], tone: "bad" },
    { id: "a3", pillar: "time", title: "Engineering — 2 stories slipping", detail: "KAN-112 and KAN-118 are behind their phase target; the roll-up has D3 amber.", actions: ["See plan"], tone: "warn" },
  ],
  lanes: [
    { discipline: "Product", cells: {} },
    { discipline: "Engineering", cells: { Build: [
      { key: "KAN-20", title: "Auth", status: "good", assignee: "Maria", deliverable: "D2" },
      { key: "KAN-30", title: "Dashboard UI", status: "warn", assignee: "Maria", deliverable: "D3", note: "KAN-112 blocked 3d" },
    ] } },
    { discipline: "QA", cells: {
      Build: [{ key: "KAN-22", title: "Auth test suite", status: "good", assignee: "Priya", deliverable: "D2" }],
      QA: [{ key: "KAN-40", title: "Portal regression", status: "idle", assignee: "Priya", deliverable: "D4" }],
    } },
    { discipline: "Design", cells: { Build: [{ key: "KAN-30d", title: "Dashboard design", status: "good", assignee: "Alex", deliverable: "D3" }] } },
  ],
  discoveryDone: ["Product", "Engineering", "QA", "Design"],
  roles: [
    { id: "exec", roleCode: "exec", name: "Dana Whit", title: "Delivery Exec", initials: "DW" },
    { id: "pm", roleCode: "pm", name: "Jen Okafor", title: "Product Manager", initials: "JO" },
    { id: "eng", roleCode: "eng", name: "Maria Santos", title: "Engineer", initials: "MS" },
  ],
  jobs: [
    // Product Manager (Jen)
    { id: "j-pm-1", role: "pm", kind: "review", title: "Review 4 stories — D3 Dashboard", subtitle: "Your PM agent decomposed D3 into functional stories, grounded to the deliverable.", meta: "AI-decomposed · 1 flagged scope creep", related: "D3", primary: "Review", secondary: "Approve all" },
    { id: "j-pm-2", role: "pm", kind: "review", title: "Review brief — D4 Reporting", subtitle: "Normalized from SOW §4. 3 open questions to resolve before decomposition.", meta: "AI-drafted", related: "D4", primary: "Review" },
    { id: "j-pm-3", role: "pm", kind: "approve", title: "KAN-112 — ready to build?", subtitle: "Functionally ready, but the design sub-task is undelivered. Approve the gate or hold.", related: "KAN-112", primary: "Approve", secondary: "Hold" },
    // Engineer (Maria)
    { id: "j-eng-1", role: "eng", kind: "review", title: "Review PR — KAN-101 Login", subtitle: "Your engineer agent implemented it and tests are green. Your review + merge.", meta: "AI-built · CI ✓", related: "KAN-101", primary: "Review & merge" },
    { id: "j-eng-2", role: "eng", kind: "blocked", title: "KAN-112 Filter bar", subtitle: "Can't start — blocked by the design sub-task (KAN-30d, Alex).", related: "KAN-112", primary: "Get help", secondary: "Raise CR", tone: "warn" },
    { id: "j-eng-3", role: "eng", kind: "drafting", title: "Tech-design — KAN-105 Saved filters", subtitle: "Your architect agent is drafting the technical approach, grounded in the code…", related: "KAN-105" },
    { id: "j-eng-4", role: "eng", kind: "build", title: "Build & merge — KAN-118 Saved views", subtitle: "Ready + tech-ready. Your engineer agent implements, runs the CI-parity checks, and opens the PR.", meta: "ready · tech-ready", related: "KAN-118", primary: "Build" },
    // QA (Priya)
    { id: "j-qa-1", role: "qa", kind: "review", title: "Review test plan — KAN-22 Auth suite", subtitle: "Your QA agent drafted the auth happy-path + edge coverage.", meta: "AI-drafted", related: "KAN-22", primary: "Review" },
    { id: "j-qa-2", role: "qa", kind: "drafting", title: "KAN-40 Portal regression", subtitle: "Queued — begins once the Build phase closes.", related: "KAN-40" },
    // Design (Alex)
    { id: "j-design-1", role: "design", kind: "deliver", title: "Deliver — KAN-30d Dashboard design", subtitle: "Compass specced the requirements; deliver the Figma. This unblocks KAN-112.", meta: "needs-design · blocking", related: "KAN-30d", primary: "Deliver Figma", tone: "warn" },
    // Delivery Exec (Dana)
    { id: "j-exec-1", role: "exec", kind: "approve", title: "Approve change request — “CSV export”", subtitle: "Out of SOW-2041. Fixed-bid: needs client sign-off before it enters scope (billable).", meta: "boundary crossing", related: "cr-csv", primary: "Approve CR", secondary: "Decline", tone: "bad" },
  ],
  failedRun: {
    runId: "build-KAN-112",
    role: "Engineer",
    story: "KAN-112 · Filter bar",
    failedStep: "step 4 — CI-parity checks",
    error: "2 tests failing in dashboard.filters.test.ts (empty-state render)",
    diagnosis:
      "The build stopped at the checks step, not in code review. Two filter tests fail because the design sub-task (KAN-30d) landed a new empty-state that the story's fixtures don't cover yet — the diff is correct, the fixtures are stale. This isn't a logic bug; it's an un-synced test fixture.",
    fix: "Update the empty-state fixture in dashboard.filters.test.ts to match KAN-30d, then resume.",
    resumeFrom: "step 4 (checks)",
  },
  engagements: [{ id: "acme", name: "Acme Customer Portal", sow: "SOW-2041" }],
  activeEngagementId: "acme",
  connectors: { figma_url: "", docs_provider: "confluence", confluence_space: "", confluence_root_page_id: "", atlassian_base_url: "", atlassian_email: "", teams_site: "", graph_tenant_id: "", graph_client_id: "", jira_project: "", jira_board_id: "", has_atlassian_token: false, has_graph_secret: false },
  deliverables: [{ code: "D3", title: "Dashboard", status: "in-progress" }, { code: "D4", title: "Reporting", status: "planned" }],
  epics: [{ id: "KAN-30", title: "Dashboard", discipline: "Engineering", stories: 3, research: "none" }],
  storyList: [],
  activity: [],
  metrics: [],
  atlassianBase: "",
  repos: [],
};
