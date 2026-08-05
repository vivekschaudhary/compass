// Adapter registry — the `@docs` / `@tickets` / `@scm` slots, and who can fill them.
//
// A slot is a CAPABILITY, never a vendor: a workflow writes `product-brief@docs` and does not
// know or care whether that resolves to Confluence or Teams. This file is where that resolution
// is declared, once, for every surface that has to configure it (new-engagement setup, settings).
//
// Two things it deliberately does:
//
//  1. **Fields travel with the provider.** Picking a provider tells you exactly what it needs —
//     no screen has to hardcode "if confluence, show space key". Adding a provider is a new entry
//     here, not an edit in every form.
//
//  2. **Declared ≠ implemented.** Providers we intend to support but have not built are listed
//     with `status: "declared"` so the vocabulary is honest and visible, and the UI can show them
//     disabled rather than offering a choice that silently does nothing. Same discipline as the
//     framework's `[declare-not-implement]`.
//
// Field `key`s are engagement column names, so a form can build its patch generically.

export type AdapterField = {
  key: string;              // engagement column
  label: string;
  placeholder?: string;
  required?: boolean;       // blocks provisioning when empty
  help?: string;
};

export type AdapterOption = {
  id: string;
  label: string;
  status: "implemented" | "declared";
  fields: AdapterField[];
  note?: string;            // shown when declared — why it is not selectable yet
};

export type AdapterSlot = {
  slot: "docs" | "tickets";
  label: string;
  help: string;
  /**
   * Engagement column holding the chosen provider id — or null when the slot has only one
   * implemented provider and therefore nothing to store yet. `tickets` is null today: Jira is
   * the only tracker built, `resolveJira` is the resolver, and there is no `tickets_provider`
   * column. Adding a second tracker means adding the column and setting this — deliberately
   * NOT pre-adding it, so the schema never carries a field nothing reads (`[declare-not-implement]`).
   */
  providerKey: string | null;
  options: AdapterOption[];
};

// Credentials (base url / email / API token) are resolved per-engagement with an env fallback
// (`resolveJira`, `cfAuth`), so they are NOT adapter fields here — a form that asked for a token
// per slot would ask twice for the same Atlassian account and invite pasting secrets into two
// places. Per-engagement credential overrides belong in Settings, not in engagement setup.
export const ADAPTER_SLOTS: AdapterSlot[] = [
  {
    slot: "docs",
    label: "Document storage",
    help: "Where this engagement's deliverables live — including the SOW itself, so every artifact has one traceable source.",
    providerKey: "docs_provider",
    options: [
      {
        id: "confluence",
        label: "Confluence",
        status: "implemented",
        fields: [
          { key: "confluence_space", label: "Space key", placeholder: "e.g. NWRETAIL", required: true },
          { key: "confluence_root_page_id", label: "Root page id", placeholder: "pages nest beneath this",
            help: "Optional. Without it, pages land at the space root." },
        ],
      },
      {
        id: "teams",
        label: "Teams / SharePoint",
        status: "implemented",
        fields: [
          { key: "teams_site", label: "Site", placeholder: "host:/sites/Name", required: true,
            help: "A webUrl, a site id, or host:/sites/Name." },
        ],
      },
      { id: "notion", label: "Notion", status: "declared", fields: [], note: "Not built yet." },
      { id: "gdrive", label: "Google Drive", status: "declared", fields: [], note: "Not built yet." },
    ],
  },
  {
    slot: "tickets",
    label: "Issue tracker",
    help: "Where work and human approval gates are tracked.",
    providerKey: null,   // see AdapterSlot.providerKey — Jira is the only tracker built
    options: [
      {
        id: "jira",
        label: "Jira",
        status: "implemented",
        fields: [
          { key: "jira_project", label: "Project key", placeholder: "e.g. NWR", required: true },
          { key: "jira_board_id", label: "Board id", placeholder: "optional" },
        ],
      },
      { id: "linear", label: "Linear", status: "declared", fields: [], note: "Not built yet." },
      { id: "azure-boards", label: "Azure Boards", status: "declared", fields: [], note: "Not built yet." },
    ],
  },
];

export function slotByName(slot: AdapterSlot["slot"]): AdapterSlot {
  const s = ADAPTER_SLOTS.find((x) => x.slot === slot);
  if (!s) throw new Error(`unknown adapter slot: ${slot}`);
  return s;
}

export function optionFor(slot: AdapterSlot["slot"], id: string): AdapterOption | undefined {
  return slotByName(slot).options.find((o) => o.id === id);
}

export function defaultProvider(slot: AdapterSlot["slot"]): string {
  return slotByName(slot).options.find((o) => o.status === "implemented")!.id;
}

/** Required field keys that are still empty — what blocks provisioning, per slot. */
export function missingRequired(slot: AdapterSlot["slot"], providerId: string, values: Record<string, string>): AdapterField[] {
  const opt = optionFor(slot, providerId);
  if (!opt) return [];
  return opt.fields.filter((f) => f.required && !(values[f.key] ?? "").trim());
}

/** Every engagement column the registry can write — the whitelist a provisioning API applies. */
export function adapterColumns(): string[] {
  const cols: string[] = [];
  for (const s of ADAPTER_SLOTS) {
    if (s.providerKey) cols.push(s.providerKey);
    for (const o of s.options) for (const f of o.fields) cols.push(f.key);
  }
  return [...new Set(cols)];
}
