---
title: Incident Response
version: 2026.1
last_updated: 2026-02-24
owner: Security Team
---

# Incident Response

## Incident response plan

Vantrel maintains a documented Security Incident Response Plan, reviewed annually and tested through tabletop exercises at least twice a year. The plan defines roles (incident commander, communications lead, technical lead), severity levels and escalation paths.

## Detection

Security events are collected from AWS, Cloudflare, Datadog and endpoint agents. Alerts are triaged 24/7 by an on-call security engineer. Critical alerts must be acknowledged within 15 minutes.

## Severity levels

- **SEV1**: confirmed breach of customer data or complete service outage.
- **SEV2**: suspected breach, or major degradation affecting many customers.
- **SEV3**: limited impact, no customer data involved.

## Customer communication

- Service availability incidents are published on the public status page (status.vantrel.example), with updates at least every 60 minutes for SEV1 incidents.
- Customers affected by a security incident involving their data are notified by email by the Security team, in accordance with the timelines defined in the Data Processing Agreement.
- A post-incident report (root cause analysis) is shared with affected customers within 10 business days after a SEV1 incident is resolved.

## Reporting a vulnerability

Security researchers and customers can report vulnerabilities to security@vantrel.example. Vantrel also runs a private bug bounty program with invited researchers. Vantrel commits to acknowledging vulnerability reports within 2 business days.
