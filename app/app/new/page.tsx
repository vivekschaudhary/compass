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
        {/* Intake opens nothing now — the delivery manager decides when work begins. The old
            sentence promised a workflow that no longer starts itself. */}
        We need the below values to create the engagement
      </p>
      <NewEngagementForm />
    </div>
  );
}
