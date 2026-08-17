// Starting an engagement.
//
// One screen, and the SOW is the point of it: everything downstream — the backlog, the coverage
// map, every citation — derives from this text. v1 kept a sixty-character label and threw the
// contract away, which is why its agents had nothing to read.

import { NewEngagementForm } from "./NewEngagementForm";

export const dynamic = "force-dynamic";

export default function NewEngagementPage() {
  return (
    <div className="page">
      <h2>Start an engagement</h2>
      <p className="jobs-blurb">
        Paste the SOW. Compass files it as the engagement&apos;s first document, scaffolds the doc
        tree around it, and opens the workflow that runs when a project is created.
      </p>
      <NewEngagementForm />
    </div>
  );
}
