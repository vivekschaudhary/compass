---
id: <BET-ID>-ARCH
bet: <BET-ID>
status: proposed
created: YYYY-MM-DD
authors: [Architect, Enterprise/Solution Architect]
area_tags: []
---

# Technical Design: <Bet Title>

## Decision

<One clear paragraph. The chosen approach. Unambiguous.>

## Context

<Technical situation, constraints, current state of relevant code.>

## Approach

### Components affected
- `<path/to/module>` — what changes
- `<path/to/module>` — what changes

### Data model changes
<New tables, columns, migrations. Or "none.">

### API / contract changes
<New endpoints, fields, breaking vs additive. Or "none.">

### Dependencies
<New libraries, services. Justify each.>

## Enterprise/Solution Architect input

### Cross-system implications
<New service? New third-party? Crosses boundaries?>

### Standards compliance
<Does this conform to foundation architecture standards? Any drift flagged?>

### Cost / capacity / vendor lock-in
<Any concerns.>

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|--------|------|------|----------------|
| Chosen | | | — |
| Alt A | | | |
| Alt B | | | |

## Consequences

**Positive:**
-

**Negative:**
-

**Reversibility:** easy | medium | hard | one-way door

## Test strategy

- **Unit:** <categories of unit tests>
- **Integration / API:** <flows>
- **Component (frontend):** <coverage>
- **E2E** (written by Codex): <critical paths>
- **Other:** <perf, load, security>

## Rollout

- **Feature flag?** yes/no — name and default
- **Migration?** yes/no — strategy
- **Backwards compatibility?** required / not required
- **Staged rollout?** yes/no — plan

## Open questions for Engineer

<Things Engineer should ESCALATE to Architect rather than improvise.>

## DRI Log

### Decisions
- [YYYY-MM-DD] [Architect | Principal Engineer] <decision> — rationale — area — alternatives — reversibility

### Risks
- [YYYY-MM-DD] [role] <risk> — likelihood — impact — mitigation — area

### Issues
- [YYYY-MM-DD] [role] <issue> — severity — owner — status — area

---

_Approved by: <name> on <date>_
