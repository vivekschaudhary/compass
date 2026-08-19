"use client";

import { useState } from "react";
import { Field, Input, Textarea, Button } from "../_ui/primitives";

type Result = {
  engagementId: string; documents: number; sowSections: number;
  openedWorkflow: string | null; published: number; problems: string[];
};

export function NewEngagementForm() {
  const [f, setF] = useState({
    name: "", client: "", sowText: "", briefText: "", deliveryManager: "",
    confluenceSpace: "", confluenceRootPageId: "", jiraProject: "",
  });
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit() {
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/v2/onboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, publish, docsProvider: "confluence" }),
      });
      const d = await res.json();
      if (d.error) setError(d.error); else setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  if (result?.engagementId) {
    return (
      <div className="onboard-done">
        <h3>{result.engagementId}</h3>
        <ul className="onboard-facts">
          <li>{result.documents} documents scaffolded</li>
          <li>SOW filed in {result.sowSections} section{result.sowSections === 1 ? "" : "s"}</li>
          {/* Intake provisions and stops. "no workflow opened" read as a failure when it is the
              design — the delivery manager decides when the engagement starts, which may be days
              after the admin creates it. Say what happens next instead of what did not happen. */}
          <li>{result.openedWorkflow
            ? `${result.openedWorkflow} opened — its first job is in the queue`
            : "ready for the delivery manager to initiate Basecamp"}</li>
          <li>{result.published} published to the doc store</li>
        </ul>
        {/* Problems are shown, not swallowed. An engagement created with a failed publish is a real
            state and the person who created it should know before they go looking for the page. */}

        {result.problems.length > 0 && (
          <div className="onboard-problems">
            <strong>Some parts did not complete:</strong>
            <ul>{result.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
        )}
        <a className="btn btn-primary" href={`/v2/e/${result.engagementId}/jobs`}>Open the queue →</a>
      </div>
    );
  }

  return (
    <div className="onboard">
      <div className="onboard-row">
        <Field label="Engagement name"><Input value={f.name} onChange={set("name")} placeholder="Provider directory rebuild" /></Field>
        <Field label="Client"><Input value={f.client} onChange={set("client")} placeholder="Northwind Health" /></Field>
        <Field label="Delivery manager" hint="Who runs it. Everyone else is staffed by a job; this person runs that job.">
          <Input value={f.deliveryManager} onChange={set("deliveryManager")} placeholder="Vivek" />
        </Field>
      </div>

      <Field label="The SOW" hint="Paste it in full. Every downstream document cites this, so a summary here becomes a summary everywhere.">
        <Textarea rows={14} value={f.sowText} onChange={set("sowText")} placeholder="Project parameters, scope, milestones, commercial terms…" />
      </Field>

      {/* Optional, and supplied far more often than written — in consulting the requirements
          document exists before the engagement does. Given one, `create-product-brief` starts from
          the client's own words instead of a blank page, and the epics are written from it. */}
      <Field label="Product brief or BRD" hint="If the client already has one, paste it. Groundwork writes the epics from this — without it, Compass has to draft the brief first.">
        <Textarea rows={8} value={f.briefText} onChange={set("briefText")} placeholder="Optional. Business requirements, product brief, discovery output…" />
      </Field>

      <div className="onboard-row">
        <Field label="Confluence space" hint="The gate checks this by asking Confluence, not by checking it is non-empty.">
          <Input value={f.confluenceSpace} onChange={set("confluenceSpace")} placeholder="NWR" />
        </Field>
        <Field label="Root page id"><Input value={f.confluenceRootPageId} onChange={set("confluenceRootPageId")} placeholder="13860865" /></Field>
        <Field label="Jira project"><Input value={f.jiraProject} onChange={set("jiraProject")} placeholder="NWR" /></Field>
      </div>

      <label className="onboard-publish">
        <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
        Publish the SOW to the doc store now
      </label>

      <div className="onboard-actions">
        <Button variant="primary" disabled={busy || !f.name.trim() || !f.sowText.trim() || !f.deliveryManager.trim()} onClick={submit}>
          {busy ? "Creating…" : "Create the engagement"}
        </Button>
        {!f.sowText.trim() && <span className="text-muted onboard-note">The SOW is required — everything derives from it.</span>}
        {f.sowText.trim() && !f.deliveryManager.trim() && <span className="text-muted onboard-note">A delivery manager is required — an engagement with nobody on it has no queue.</span>}
        {error && <span className="start-error">{error}</span>}
      </div>
    </div>
  );
}
