---
title: Infrastructure and Hosting
version: 2026.1
last_updated: 2026-01-20
owner: Platform Engineering
---

# Infrastructure and Hosting

## Cloud provider

Vantrel Plan is hosted entirely on Amazon Web Services (AWS). Vantrel does not operate its own data centers. Physical security of the data centers (access control, surveillance, environmental controls) is managed by AWS and covered by AWS's own certifications (ISO 27001, SOC 1/2/3). Vantrel reviews AWS's audit reports annually as part of its vendor management process.

## Hosting regions

Customers choose a hosting region when their tenant is created:

| Region | Primary location | Disaster recovery location |
|---|---|---|
| EU (default) | AWS eu-west-3 (Paris, France) | AWS eu-central-1 (Frankfurt, Germany) |
| US (available since 2024) | AWS us-east-1 (N. Virginia) | AWS us-west-2 (Oregon) |

Customer data at rest stays within the selected region, including backups and disaster recovery copies. Moving an existing tenant from one region to another is possible on request for Enterprise customers.

No other hosting regions are currently offered.

## Architecture

Vantrel Plan runs as containerized services on Amazon EKS (Kubernetes) spread across three availability zones in each primary region. Customer data is stored in Amazon Aurora PostgreSQL (multi-AZ) and Amazon S3. Calculation workloads run on dedicated compute nodes that scale automatically with demand.

## Network security

- Public traffic enters through Cloudflare, which provides the CDN, a Web Application Firewall (WAF) and DDoS protection.
- Production services run in private subnets with no direct internet access.
- Administrative access to production goes through a bastion with SSO, MFA and session recording. Direct SSH access is disabled.
- Security groups follow a default-deny approach.

## Logging and monitoring

Infrastructure and application logs are centralized in Datadog (EU site for EU-hosted tenants). Security alerts are routed to the on-call security engineer 24/7. Infrastructure logs are retained for 12 months.

## Environments

Vantrel maintains separate AWS accounts for production, staging and development. Access to production accounts is restricted to the Platform Engineering and Security teams and reviewed quarterly.
