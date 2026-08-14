// Organic, as React.
//
// These are DELIBERATELY thin, and they carry NO STYLE. A component here does two things and no
// more: name a class, and give the prop a TypeScript type.
//
// Every visual decision lives in exactly one of two stylesheets — `organic.css`, vendored verbatim
// from the design system, or `compass.css`, which holds the classes the system does not ship. If
// you are about to write a colour, a radius or a px value in this file, it belongs in compass.css
// instead: a style written at a call site is invisible to every other call site and drifts
// immediately.
//
// A component's own layout counts as look and lives in the stylesheet with it — a job card's flex
// and gap are part of the card, not something every caller must remember. Page composition is the
// caller's job, in Tailwind.

import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* ── buttons ─────────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost";

export function Button({
  variant = "secondary", icon = false, block = false, compact = false, className, children, ...rest
}: {
  variant?: ButtonVariant; icon?: boolean; block?: boolean; compact?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx("btn", `btn-${variant}`, icon && "btn-icon", block && "btn-block", compact && "btn-compact", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ── tags ────────────────────────────────────────────────────────────────── */

type TagTone = "accent" | "accent-2" | "neutral" | "outline";

export const Tag = ({ tone = "neutral", className, children }: { tone?: TagTone; className?: string; children: ReactNode }) =>
  <span className={cx("tag", `tag-${tone}`, className)}>{children}</span>;

/* ── cards ───────────────────────────────────────────────────────────────── */

type Elevation = "sm" | "md" | "lg";

export const Card = ({ elevation, className, children }: { elevation?: Elevation; className?: string; children: ReactNode }) =>
  <div className={cx("card", elevation && `elev-${elevation}`, className)}>{children}</div>;

export const CardKicker = ({ children }: { children: ReactNode }) => <span className="card-kicker">{children}</span>;
export const CardTitle = ({ children }: { children: ReactNode }) => <span className="card-title">{children}</span>;
export const CardBody = ({ children }: { children: ReactNode }) => <p className="card-body">{children}</p>;
export const CardMeta = ({ children }: { children: ReactNode }) => <div className="card-meta">{children}</div>;

/* ── forms ───────────────────────────────────────────────────────────────── */

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <p className="text-muted field-hint">{hint}</p>}
    </div>
  );
}

export const Input = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) =>
  <input className={cx("input", className)} {...rest} />;

export const Textarea = ({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) =>
  <textarea className={cx("input", className)} {...rest} />;

/** A real <input type="radio"> with Organic's styled sibling — keyboard behaviour and form
 *  semantics come free, which a div-based control would have to reimplement and usually gets wrong. */
export function Radio({ name, value, checked, onChange, children }: {
  name: string; value: string; checked?: boolean; onChange?: (v: string) => void; children: ReactNode;
}) {
  return (
    <label className="radio">
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onChange?.(value)} />
      <span className="dot" />
      {children}
    </label>
  );
}

export function Segmented({ name, options, value, onChange }: {
  name: string; options: { value: string; label: string }[]; value?: string; onChange?: (v: string) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <label key={o.value} className="seg-opt">
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange?.(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/* ── table ───────────────────────────────────────────────────────────────── */

export const Table = ({ head, children }: { head: ReactNode[]; children: ReactNode }) => (
  <table className="table">
    <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table>
);

/* ── dialog ──────────────────────────────────────────────────────────────── */

export function Dialog({ title, actions, children, inline = false }: {
  title: string; actions?: ReactNode; children: ReactNode;
  /** Render in flow rather than over a fixed backdrop — for the design library. */
  inline?: boolean;
}) {
  const panel = (
    <div className="dialog">
      <span className="dialog-title">{title}</span>
      <div className="dialog-body">{children}</div>
      {actions && <div className="dialog-actions">{actions}</div>}
    </div>
  );
  return inline ? <div className="dialog-inline">{panel}</div> : <div className="dialog-backdrop">{panel}</div>;
}

/* ── Compass additions ───────────────────────────────────────────────────────
   Organic ships buttons, tags, cards, forms, a nav bar, a table and a dialog. A delivery
   workspace needs a few more marks. Their classes are in compass.css, built from Organic's own
   tokens — no new colour, no new radius — so they read as part of the system. */

/** A person, as initials. Filled when they are who you are working as. */
export const Avatar = ({ initials, active = false, large = false }: { initials: string; active?: boolean; large?: boolean }) =>
  <span className={cx("avatar", active && "avatar-active", large && "avatar-lg")}>{initials}</span>;

/** The round mark that opens a job card — a glyph, not an icon set. */
export const Glyph = ({ children, small = false, solid = false }: { children: ReactNode; small?: boolean; solid?: boolean }) =>
  <span className={cx("glyph", small && "glyph-sm", solid && "glyph-solid")}>{children}</span>;

/** A document the agent will read. Dashed, so an input is never mistaken for a state. */
export const ReadChip = ({ children }: { children: ReactNode }) => <span className="read-chip">{children}</span>;

/** "reads a · b · c" — the provenance line, at card altitude. */
export const ReadsLine = ({ docs }: { docs: string[] }) => (
  <div className="reads">
    <span className="reads-label">reads</span>
    {docs.map((d) => <ReadChip key={d}>{d}</ReadChip>)}
  </div>
);

/** A status mark. `live` blinks — used only where something is genuinely happening now. */
export const Dot = ({ live = false, muted = false }: { live?: boolean; muted?: boolean }) =>
  <span className={cx("status-dot", muted && "status-dot-muted", live && "blink")} />;

/** A dot with its label — the pairing is common enough to be one mark. */
export const Status = ({ live, muted, children }: { live?: boolean; muted?: boolean; children: ReactNode }) => (
  <span className="status-line"><Dot live={live} muted={muted} />{children}</span>
);

/** Organic's h6 is already the uppercase micro-label; this fixes its colour and spacing so every
 *  section header in the app is the same mark. */
export const SectionLabel = ({ children, className }: { children: ReactNode; className?: string }) =>
  <h6 className={cx("section-label", className)}>{children}</h6>;

/* ── the job card — the product's central object ─────────────────────────── */

export function JobCard({ glyph, title, related, meta, subtitle, reads, action, agent }: {
  glyph: ReactNode; title: string; related?: string; meta?: string; subtitle: string;
  reads: string[]; action?: ReactNode; agent?: string;
}) {
  return (
    <div className="job-card rise">
      <Glyph>{glyph}</Glyph>
      <div className="job-card-main">
        <div className="job-card-head">
          <span className="job-card-title">{title}</span>
          {related && <Tag tone="neutral">{related}</Tag>}
          {meta && <Tag tone="accent-2">{meta}</Tag>}
        </div>
        <p className="job-card-sub">{subtitle}</p>
        <div className="job-card-reads"><ReadsLine docs={reads} /></div>
      </div>
      {(action || agent) && (
        <div className="job-card-side">
          {action}
          {agent && <span className="job-card-agent">{agent}</span>}
        </div>
      )}
    </div>
  );
}

/** A document in the job's context pane, with its reading state. */
export const ContextRow = ({ name, detail, reading = false }: { name: string; detail?: string; reading?: boolean }) => (
  <div className="context-row">
    <Dot live={reading} muted={!reading} />
    <div className="context-row-body">
      <p className="context-row-name">{name}</p>
      {detail && <p className="context-row-detail">{detail}</p>}
    </div>
  </div>
);
