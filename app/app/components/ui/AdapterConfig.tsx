"use client";

import { AdapterSlot, optionFor } from "@/app/lib/adapters";

// One reusable control for configuring an adapter slot: pick a provider, fill exactly the fields
// that provider needs. Driven entirely by the registry in lib/adapters.ts, so adding a provider
// (or a field) never means editing a form — which is what stops the new-engagement screen and
// Settings from drifting apart.
//
// Declared-but-unbuilt providers render disabled with their reason, rather than being hidden.
// Hiding them would make the roadmap invisible; offering them would be a lie.
export function AdapterConfig({ slot, provider, onProvider, values, onValue }: {
  slot: AdapterSlot;
  provider: string;
  onProvider: (id: string) => void;
  values: Record<string, string>;
  onValue: (key: string, value: string) => void;
}) {
  const opt = optionFor(slot.slot, provider);

  return (
    <div>
      <span className="text-[11px] font-medium uppercase tracking-wide text-faint">{slot.label}</span>
      <p className="mt-0.5 text-[12px] text-muted">{slot.help}</p>

      <div className="mt-2 flex flex-wrap gap-2">
        {slot.options.map((o) => {
          const declared = o.status === "declared";
          const active = o.id === provider;
          return (
            <button
              key={o.id}
              type="button"
              disabled={declared}
              title={declared ? o.note : undefined}
              onClick={() => onProvider(o.id)}
              className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                active ? "border-brand bg-brand-weak text-brand-ink"
                : declared ? "cursor-not-allowed border-line bg-shell/40 text-faint"
                : "border-line bg-card text-body hover:bg-shell"
              }`}
            >
              {o.label}
              {declared && <span className="ml-1.5 text-[10.5px] uppercase tracking-wide">soon</span>}
            </button>
          );
        })}
      </div>

      {opt && opt.fields.length > 0 && (
        <div className={`mt-3 grid gap-3 ${opt.fields.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {opt.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-faint">
                {f.label}{!f.required && <span className="text-faint/70"> · optional</span>}
              </span>
              <input
                value={values[f.key] ?? ""}
                onChange={(e) => onValue(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand"
              />
              {f.help && <span className="mt-1 block text-[11.5px] text-muted">{f.help}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
