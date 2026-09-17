"use client";

import { useState } from "react";
import { Field, Input, Textarea, Button } from "../_ui/primitives";
import { readEnvelope, isRefused, type Refusal } from "@/app/lib/envelope";

type Result = {
  engagementId: string;
  // documents: number;
  // sowSections: number;
  // openedWorkflow: string | null;
  published: number;
  problems: string[];
};

export function NewEngagementForm() {
  const [f, setF] = useState({
    name: "",
    client: "",
    briefText: "",
    deliveryManager: "",
    confluenceSpace: "",
    confluenceRootPageId: "",
    jiraProject: "",
  });
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kept apart from `error`: a refusal is something to fix in this form, and there may be several.
  const [refusals, setRefusals] = useState<Refusal[]>([]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit() {
    setBusy(true);
    setError(null);
    setRefusals([]);
    setResult(null);
    try {
      const res = await fetch("/api/v2/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, publish, docsProvider: "confluence" }),
      });
      // Checked on `ok`, never on the presence of `error`. A refusal carries no `error` key, and
      // testing for one sent a declined request down the success branch — where no engagement id
      // meant nothing rendered at all.
      const d = await readEnvelope<Result>(res);
      if (d.ok) setResult(d);
      else if (isRefused(d)) setRefusals(d.refusals);
      else setError(d.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (result?.engagementId) {
    return (
      <div className="onboard-done">
        <h3>{result.engagementId}</h3>

        {/* Problems are shown, not swallowed. An engagement created with a failed publish is a real
            state and the person who created it should know before they go looking for the page. */}

        {result.problems.length > 0 && (
          <div className="onboard-problems">
            <strong>Some parts did not complete:</strong>
            <ul>
              {result.problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        <a
          className="btn btn-primary"
          href={`/v2/e/${result.engagementId}/jobs`}
        >
          Open the queue →
        </a>
      </div>
    );
  }

  return (
    <div className="onboard">
      <div className="onboard-row">
        <Field label="Engagement name">
          <Input
            value={f.name}
            onChange={set("name")}
            placeholder="Provider directory rebuild"
          />
        </Field>
        <Field label="Client">
          <Input
            value={f.client}
            onChange={set("client")}
            placeholder="Northwind Health"
          />
        </Field>
        <Field
          label="Delivery manager"
          hint="Who runs it. Everyone else is staffed by a job; this person runs that job."
        >
          <Input
            value={f.deliveryManager}
            onChange={set("deliveryManager")}
            placeholder="John"
          />
        </Field>
      </div>

      <div className="onboard-row">
        <Field
          label="Confluence space"
          hint="The gate checks this by asking Confluence, not by checking it is non-empty."
        >
          <Input
            value={f.confluenceSpace}
            onChange={set("confluenceSpace")}
            placeholder="NWR"
          />
        </Field>
        <Field label="Root page id">
          <Input
            value={f.confluenceRootPageId}
            onChange={set("confluenceRootPageId")}
            placeholder="13860865"
          />
        </Field>
        <Field label="Jira project">
          <Input
            value={f.jiraProject}
            onChange={set("jiraProject")}
            placeholder="NWR"
          />
        </Field>
      </div>

      <div className="onboard-actions">
        <Button
          variant="primary"
          disabled={busy || !f.name.trim() || !f.deliveryManager.trim()}
          onClick={submit}
        >
          {busy ? "Creating…" : "Create the engagement"}
        </Button>
        {!f.deliveryManager.trim() && (
          <span className="text-muted onboard-note">
            A delivery manager is required — an engagement with nobody on it has
            no queue.
          </span>
        )}
        {error && <span className="start-error">{error}</span>}
      </div>

      {refusals.length > 0 && (
        <div className="onboard-problems onboard-refusals" role="alert">
          <strong>Not created:</strong>
          <ul>
            {refusals.map((r, i) => (
              <li key={i}>
                {r.message}
                {r.fix && <> {r.fix}</>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
