---
title: Business Continuity and Disaster Recovery
version: 2026.1
last_updated: 2026-04-07
owner: Platform Engineering
---

# Business Continuity and Disaster Recovery

## Objectives

Vantrel maintains a Business Continuity Plan (BCP) and a Disaster Recovery Plan (DRP) for Vantrel Plan. In the event of a major incident affecting an entire AWS region, the objectives are:

- **Recovery Point Objective (RPO)**: 1 hour.
- **Recovery Time Objective (RTO)**: 4 hours.

## High availability

Within each primary region, all production services run across three availability zones. The loss of a single availability zone does not cause data loss and is handled automatically, usually without visible impact for users.

## Backups

- Databases are backed up continuously, with point-in-time recovery available for the last 7 days.
- Full encrypted snapshots are taken daily and retained for 35 days.
- Backups are replicated to the disaster recovery location of the customer's region (see Infrastructure and Hosting).
- Backup restoration is tested monthly on a random sample of tenants.

Restoring an individual customer's data to an earlier point in time (for example after an accidental deletion by a user) is possible on request through support, within the backup retention window.

## Testing

The full Disaster Recovery Plan, including region failover, is tested at least once a year. The last test was performed in February 2026 and achieved a recovery time of 2 hours and 40 minutes. A summary of the latest test results can be shared with Enterprise customers under NDA.

## Business continuity for operations

Vantrel's teams can work fully remotely. Critical roles (on-call engineering, security, support) have documented backups so that the service can be operated even if an office becomes unavailable.
