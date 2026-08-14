"use client";

// The design library — Organic as this app actually uses it.
//
// Built from the same components the product imports, so it cannot drift into being a pretty lie
// about what the app looks like. Every component appears in the states that exist, not one happy
// instance each: a button that is disabled, a tag in all four tones, a card at every elevation.
//
// No inline styles, and no stylesheet of its own — this page's chrome lives in compass.css with
// everything else. Where a value varies per element the page passes a custom property — that is
// data, not a second definition of the look. Component layout is CSS; page composition is
// Tailwind — see the note in ../layout.tsx.

import { useState, type CSSProperties } from "react";
import {
  Button, Tag, Card, CardKicker, CardTitle, CardBody, CardMeta,
  Field, Input, Textarea, Radio, Segmented, Table, Dialog,
  Avatar, Glyph, ReadChip, ReadsLine, Status, SectionLabel, JobCard,
} from "../_ui/primitives";

const STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/** Pass a token reference through as data. The rule that consumes it is in design.css. */
const cssVar = (name: string, value: string) => ({ [name]: value }) as CSSProperties;

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="dl-section">
      <div className="dl-head">
        <h3>{title}</h3>
        {note && <p className="dl-note text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="dl-row"><span className="dl-row-label">{label}</span>{children}</div>
);

const Ramp = ({ name }: { name: string }) => (
  <div className="dl-ramp-group">
    <span className="dl-row-label">{name}</span>
    <div className="dl-ramp">
      {STEPS.map((s) => (
        <div
          key={s}
          title={`--color-${name}-${s}`}
          className={`dl-ramp-step${s >= 500 ? " dl-ramp-step-inverse" : ""}`}
          style={cssVar("--dl-c", `var(--color-${name}-${s})`)}
        >
          {s}
        </div>
      ))}
    </div>
  </div>
);

export default function DesignLibrary() {
  const [docs, setDocs] = useState("confluence");
  const [tracker, setTracker] = useState("jira");

  return (
    <div className="page">
      <header>
        <h2>Organic, as Compass uses it</h2>
        <p className="dl-intro text-muted">
          The design system is vendored verbatim as <code>organic.css</code>. These components are
          thin React wrappers over its real classes — no colour, radius or type decision lives in
          them. What Organic does not ship, and a delivery workspace needs, is at the bottom.
        </p>
      </header>

      {/* ── foundations ─────────────────────────────────────────────────── */}

      <Section title="Colour" note="A light warm ground with two accents. Each role carries a 100–900 ramp on one shared lightness scale, so the same step of any ramp has the same visual weight.">
        <div className="dl-row">
          {[["bg", "Ground"], ["surface", "Surface"], ["text", "Text"], ["accent", "Accent"], ["accent-2", "Accent 2"]].map(([token, label]) => (
            <div key={token} className="dl-role">
              <span className="dl-swatch" style={cssVar("--dl-c", `var(--color-${token})`)} />
              <span className="dl-role-name">
                {label}<br />
                <span className="dl-role-token text-muted">--color-{token}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="dl-scroll flex flex-col gap-3">
          <Ramp name="neutral" />
          <Ramp name="accent" />
          <Ramp name="accent-2" />
        </div>
      </Section>

      <Section title="Type" note="Caprasimo for headings over Figtree for body. Headings are the display voice and are used sparingly — a job title is a heading, a paragraph never is.">
        <div className="dl-type-stack">
          <h1>Heading one · 42px</h1>
          <h2>Heading two · 32px</h2>
          <h3>Heading three · 25px</h3>
          <h4>Heading four · 20px</h4>
          <h5>Heading five · 16px</h5>
          <SectionLabel>Heading six · the uppercase micro-label</SectionLabel>
          <p className="dl-body">
            Body copy is Figtree at 15px with a 1.55 line height. Finance ops at Acme rebuild the same
            three reports by hand every month — 41 support tickets this quarter are requests for a
            number someone could have pulled themselves.
          </p>
          <p className="dl-body-muted text-muted">Muted body, for supporting detail that should not compete.</p>
        </div>
      </Section>

      <Section title="Space, radius and elevation" note="Density is 1.10×, baked into the space scale. Containers are over-rounded and small controls go fully pill — that is the system's signature and it is not adjustable per screen.">
        <Row label="space">
          {[1, 2, 3, 4, 6, 8].map((n) => (
            <div key={n} className="dl-space-stack">
              <div className="dl-space" style={cssVar("--dl-w", `var(--space-${n})`)} />
              <span className="dl-space-label text-muted">{n}</span>
            </div>
          ))}
        </Row>
        <Row label="radius">
          {["sm", "md", "lg"].map((r) => (
            <div key={r} className="dl-box" style={cssVar("--dl-r", `var(--radius-${r})`)}>{r}</div>
          ))}
          <div className="dl-box" style={cssVar("--dl-r", "999px")}>pill</div>
        </Row>
        <Row label="elevation">
          {(["sm", "md", "lg"] as const).map((e) => (
            <div key={e} className={`dl-box dl-box-elev elev-${e}`}>{e}</div>
          ))}
        </Row>
      </Section>

      {/* ── controls ────────────────────────────────────────────────────── */}

      <Section title="Buttons" note="One primary per view. The accent is the product's only loud colour, so a screen with three primary buttons has no primary action at all.">
        <Row label="variants">
          <Button variant="primary">Start with agent</Button>
          <Button variant="secondary">Re-check</Button>
          <Button variant="ghost">see what&apos;s shared</Button>
        </Row>
        <Row label="disabled">
          <Button variant="primary" disabled>Publish</Button>
          <Button variant="secondary" disabled>Re-check</Button>
        </Row>
        <Row label="compact">
          <Button variant="primary" compact>Start with agent</Button>
        </Row>
        <Row label="icon">
          <Button variant="secondary" icon aria-label="Engagement setup" title="Engagement setup">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </Button>
        </Row>
        <div className="max-w-[280px]">
          <Button variant="primary" block>Create engagement</Button>
        </div>
      </Section>

      <Section title="Tags" note="Status and context at card altitude. Accent-2 is the sage second voice — used for a settled or positive state, so it reads differently from the terracotta call to action.">
        <Row label="tones">
          <Tag tone="neutral">KAN-118</Tag>
          <Tag tone="accent">framework edit</Tag>
          <Tag tone="accent-2">tech-ready</Tag>
          <Tag tone="outline">draft</Tag>
        </Row>
      </Section>

      <Section title="Forms" note="Native elements throughout — real radios, real inputs. Keyboard behaviour and form semantics come free, which a div-based control would have to reimplement and usually gets wrong.">
        <div className="grid max-w-[620px] gap-4 sm:grid-cols-2">
          <Field label="Engagement name"><Input placeholder="e.g. Store Replenishment" defaultValue="Acme Customer Portal" /></Field>
          <Field label="Client"><Input placeholder="e.g. Northwind Retail" /></Field>
          <Field label="API token" hint="Write-only. Agents use it server-side and never quote it back into a document.">
            <Input type="password" placeholder="••••••••••••" />
          </Field>
          <Field label="Why this order"><Textarea placeholder="The reasoning behind the ranking…" /></Field>
        </div>
        <Row label="radio">
          <div className="flex flex-wrap gap-4">
            {[["confluence", "Confluence"], ["teams", "Teams / SharePoint"], ["notion", "Notion"], ["repo", "Repo markdown"]].map(([v, l]) => (
              <Radio key={v} name="docs" value={v} checked={docs === v} onChange={setDocs}>{l}</Radio>
            ))}
          </div>
        </Row>
        <Row label="segmented">
          <Segmented
            name="tracker" value={tracker} onChange={setTracker}
            options={[
              { value: "jira", label: "Jira" },
              { value: "ado", label: "Azure DevOps" },
              { value: "linear", label: "Linear" },
              { value: "compass", label: "Compass only" },
            ]}
          />
        </Row>
      </Section>

      {/* ── surfaces ────────────────────────────────────────────────────── */}

      <Section title="Cards" note="The surface everything sits on. Elevation is for things that float above the page — a dialog, a menu — not for ranking content.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardKicker>Product</CardKicker>
            <CardTitle>Write the product brief</CardTitle>
            <CardBody>The agent will read the strategy, the SOW scope and 41 support tickets.</CardBody>
            <CardMeta><Status muted>not started</Status></CardMeta>
          </Card>
          <Card elevation="sm">
            <CardKicker>Engineering</CardKicker>
            <CardTitle>Foundation architecture</CardTitle>
            <CardBody>Boundaries, sequencing and cross-cutting concerns for the first three sprints.</CardBody>
            <CardMeta><Status live>agent reading</Status></CardMeta>
          </Card>
          <Card elevation="md">
            <CardKicker>Design</CardKicker>
            <CardTitle>Design library</CardTitle>
            <CardBody>The component set every screen in this engagement is built from.</CardBody>
            <CardMeta><Status>awaiting approval</Status></CardMeta>
          </Card>
        </div>
      </Section>

      <Section title="Table" note="Used for the permissions view and anything genuinely tabular. It breathes rather than scans — that is the density decision, applied consistently.">
        <div className="dl-scroll">
          <Table head={["File", "Owns it", "May edit / read"]}>
            <tr>
              <td>01-foundation/product-brief.md<br /><span className="dl-doc-sub text-muted">The strategy bet every brief hangs off</span></td>
              <td>Product Manager</td><td>PM edits · all roles read</td>
            </tr>
            <tr>
              <td>03-delivery/briefs/PROJ-42.md<br /><span className="dl-doc-sub text-muted">Product brief — self-serve reporting</span></td>
              <td>Product Manager</td><td>PM edits · PO, Design, Eng read</td>
            </tr>
            <tr>
              <td>04-governance/decisions.md<br /><span className="dl-doc-sub text-muted">DRI log — every scope call lands here</span></td>
              <td>Delivery Manager</td><td>DM edits · all roles read</td>
            </tr>
          </Table>
        </div>
      </Section>

      <Section title="Dialog" note="Shown in flow here; in the app it sits over a dimmed backdrop at the top elevation.">
        <div className="dl-dialog-stage">
          <Dialog
            inline
            title="Publish the product brief?"
            actions={<><Button variant="secondary">Not yet</Button><Button variant="primary">Publish</Button></>}
          >
            Publishing moves this document to v1.0 and queues four stories to the Product Owner, a
            design-spec job for the designer, and lets triage tag against the bet.
          </Dialog>
        </div>
      </Section>

      {/* ── Compass additions ───────────────────────────────────────────── */}

      <Section title="Compass additions" note="What Organic does not ship and this product needs. Built only from its tokens — no new colour, no new radius — so they read as part of the system.">
        <Row label="avatar">
          <Avatar initials="JO" active /><Avatar initials="RH" /><Avatar initials="AC" /><Avatar initials="MS" large />
        </Row>
        <Row label="glyph">
          <Glyph>✎</Glyph><Glyph>▶</Glyph><Glyph>⌘</Glyph><Glyph small solid>✳</Glyph>
        </Row>
        <Row label="status">
          <Status live>reading now</Status><Status>ready</Status><Status muted>not started</Status>
        </Row>
        <Row label="reads"><ReadsLine docs={["product.md", "triage-themes.md", "canon.md"]} /></Row>
        <Row label="chip"><ReadChip>story.md</ReadChip><ReadChip>design-spec.md</ReadChip></Row>
      </Section>

      <Section title="Composed — a job card" note="The primitives assembled into the real thing. If this stops matching the product, the library is lying and one of the two is wrong.">
        <div className="flex flex-col gap-3">
          <JobCard
            glyph="✎"
            title="Write the product brief — Self-serve reporting"
            related="PROJ-42"
            meta="assigned in planning"
            subtitle="Strategy doc §3 named this bet for Q3. Nothing drafted yet — the agent will read the strategy, the SOW scope and 41 support tickets, then ask you what it can't infer."
            reads={["product.md", "triage-themes.md", "canon.md"]}
            action={<Button variant="primary" compact>Start with agent</Button>}
            agent="PM agent"
          />
          <JobCard
            glyph="▶"
            title="Build KAN-118 — saved report definitions"
            related="KAN-118"
            meta="tech-ready"
            subtitle="Story is ready and tech-ready. The agent implements against the story's acceptance criteria and opens the PR; nothing runs until you start it."
            reads={["story.md", "design-spec.md", "reports"]}
            action={<Button variant="primary" compact>Start with agent</Button>}
            agent="Engineer agent"
          />
        </div>
      </Section>
    </div>
  );
}
