# Spike: can the engineer code a UI from a Figma export? (#36)

**Status:** designed + provisional recommendation. **Empirical run pending** — needs a real Figma frame + a live engineer dispatch (a testing-period task; see Protocol). This doc makes that run turnkey and records the provisional read so #171 isn't reversed on a hunch.

## The question (and why it matters)
[#171] made design a **human-owned** story (`type: design`): the AI *specs the requirements*, a human designer produces the Figma, and only then does the engineer build the UI feature. The premise was **"AI can't consume enterprise design yet."** This spike tests that premise directly: given a Figma design, can an AI engineer produce **correct, buildable UI code** — closely enough that #171 could relax (the engineer builds *from* a Figma link) rather than wait on a human to hand-translate the design into a story?

## What "the engineer can code from Figma" would require
A real yes needs the engineer to consume more than a screenshot:
1. **Structure** — frames, layers, auto-layout, component instances (not just pixels).
2. **Design tokens** — colors, type scale, spacing, radii mapped to the project's design-system components (per the stack profile), not hardcoded hex.
3. **Every state** — default / empty / loading / error / success / disabled (the Standard Experience Checklist), which a static Figma frame may not even contain.
4. **Interaction + a11y** — focus order, keyboard, ARIA — usually *not* in the Figma.

## Protocol (run this during testing)
1. **Pick one real UI slice** with a Figma frame (e.g. a WLT-27 UI story). Get its Figma **file key + node id**.
2. **Feed the engineer the structured export, not just an image.** Two feeds to compare:
   - **(a) Figma MCP / REST** — `GET /v1/files/:key/nodes?ids=:node` (frames, tokens, component names) + the rendered PNG. This is the "structured" feed.
   - **(b) screenshot only** — the PNG alone. The weaker baseline.
3. **Dispatch** `engineer.implement-story` with the design story + the chosen feed + the **stack/design-system profile** (so it maps to real components).
4. **Evaluate** the output against the criteria below. Have the human designer rate the delta.

## Evaluation criteria (score each 1–5)
| Dimension | What "good" looks like |
|---|---|
| Visual fidelity | matches the frame at a glance; layout/spacing/type right |
| Design-system adherence | uses the project's components + tokens, not ad-hoc CSS/hex |
| State completeness | all 6 Standard-Experience states present (or flagged missing) |
| Accessibility | focus/keyboard/ARIA present (Figma rarely specifies these) |
| Buildability | compiles, renders, tests pass — not just plausible-looking |
| Human-delta | how much a designer must fix before ship (the real cost) |

**Decision rule:** structured-feed (2a) scores **≥4 on fidelity + design-system + buildability, ≤2 human-delta** across 3 slices → the engineer can reliably build from Figma → **revisit #171**. Otherwise #171 stands.

## Provisional recommendation (pre-run — do NOT treat as the decision)
Based on current model capability + the Figma MCP's structured export:
- **Likely partial yes** for *layout + tokens + buildable scaffolding* from the **structured** feed (2a) — modern models produce reasonable component-mapped UI when handed frames + tokens + the design-system profile. The **screenshot-only** feed (2b) is materially weaker (hallucinated spacing/tokens).
- **Likely still-a-gap** for *every-state completeness + accessibility + pixel/design-system exactness* an enterprise designer would sign off on — these often aren't in the Figma at all, so the engineer must invent them (the exact risk #171 guards).

**So the recommendation is NOT "reverse #171."** It's: **keep human-owned design as the default, and add an *opt-in* path** — a design story may carry a real `figma_link:` that the engineer is allowed to build from directly (skipping the human hand-off) — and **gate that path on the spike's per-project score.** Decide per project after running the Protocol on the pilot's first real Figma frame. That way #171's safety holds by default, and the relaxation is earned by evidence, not assumed.

## Out of scope
- Building the Figma-pull pipeline (`--figma-export`) as production tooling — premature until the spike says it's worth it. The Protocol uses the MCP/REST directly for the experiment.
- AI *generating* the Figma/design (still humans; #171 unchanged on that).
