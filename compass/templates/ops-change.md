---
id: <OPS-ID>
type: ops
bet: <BET-ID or null>
hygiene: false
status: planned             # planned | approved | in-execution | shipped | rolled-back | deploy-failed
change_class: additive      # additive | amendment | emergency — an emergency (incident-driven) projects as a Jira Bug; additive/amendment as a Task
domain: infra               # infra | database | secrets | ci-cd | dependencies | networking | observability
blast_radius: medium        # low | medium | high
author: Enterprise/Solution Architect
created: YYYY-MM-DD
area_tags: []
---

# Ops Change: <Short description>

## What & Why

<One paragraph: what's changing, why now.>

## Affected systems

- <system>
- <system>

## Blast radius assessment

<Honest assessment. Who's affected if this goes wrong?>

## Plan

1.
2.
3.

## Rollback procedure (MANDATORY)

Step-by-step rollback. Time-bounded ("must be executable in < 5 min"). Tested in non-prod first.

1.
2.
3.

**Rollback tested:** yes/no — date — environment

## Verification

How will we know it worked?
-
-

## Execution log (filled by Engineer)

- Started: YYYY-MM-DDTHH:MM
- Steps completed:
- Completed: YYYY-MM-DDTHH:MM
- Outcome: success | rolled-back

## DRI Log

### Decisions
- [YYYY-MM-DD] [Enterprise Architect] <decision> — rationale — area: ops — reversibility

### Risks
- [YYYY-MM-DD] [Enterprise Architect] <risk> — likelihood — impact — mitigation

### Issues
- [YYYY-MM-DD] [role] <issue> — severity — owner — status
