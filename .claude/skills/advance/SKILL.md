---
name: advance
description: DEPRECATED (v0.3.0). Use direct status flips + /plan + /scan + /status instead. See compass/workflows/advance.md migration table. Skill kept registered so invocations don't fail silently — opening this workflow shows the migration path.
---

Execute the workflow at `compass/workflows/advance.md`.

**This workflow is deprecated as of v0.3.0.** When invoked, read the deprecation notice + migration table at the top of `advance.md` and print it to the user. Do not perform any phase advance, scan, plan refresh, or dashboard refresh. The user's correct next action is one of: flip the artifact's `status:` field directly; run `/plan`; run `/scan <epic-id>`; run `/dashboard`; run `/status`. See the migration table for the full mapping.

$ARGUMENTS
