---
id: <INCIDENT-ID>
type: incident
bet: <BET-ID or null>
status: open                # open | mitigated | resolved | postmortem-pending | closed
severity: P0                # P0 | P1 | P2 | P3
detected_at: YYYY-MM-DDTHH:MM
declared_by: <person / alert source>
on_call: <person>
area_tags: []
---

# Incident: <Short title>

## Summary

<One paragraph: what's happening, who's affected, current impact.>

## Timeline

| Time (UTC) | Event | By |
|------------|-------|-----|
| YYYY-MM-DDTHH:MM | Detected | <source> |
| HH:MM | Investigated, hypothesis: <H> | Engineer |
| HH:MM | Mitigation applied: <action> | <person> |
| HH:MM | Resolved | <person> |

## Investigation

### Hypotheses considered

- H1: <description> — ruled-out because <reason>
- H2: <description> — ruled-out because <reason>
- H3 (current): <description>

### Evidence

- Sentry: <link>
- Logs: <excerpt>
- Recent deploys / ops: <list>

## Mitigation (human-driven)

**Action taken:** <rollback | flag toggle | traffic shift | hotpatch>
**Decided by:** <person>
**Executed by:** <person>
**Time to mitigate:** <minutes>

## Comms

- Status page update: <link, time>
- Customer email: <link, time>
- Internal Slack: <link>

## Resolution

<What ultimately resolved the incident.>

## Postmortem reference

<Link to postmortem.md in same folder, generated after resolution.>

## DRI Log

### Decisions
- [time] [Engineer | Principal Engineer | PM] <decision> — rationale

### Risks
- [time] [role] <risk of recurrence / spread> — likelihood — impact

### Issues
- [time] [role] <issue> — severity — owner — status
