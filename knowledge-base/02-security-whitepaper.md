---
title: Security Whitepaper
version: 2026.1
last_updated: 2026-03-02
owner: Security Team
---

# Security Whitepaper

## Security program overview

Vantrel operates an Information Security Management System (ISMS) aligned with ISO/IEC 27001:2022. Security policies are reviewed at least once a year by the Security Committee and approved by the CISO.

## Certifications and audit reports

- **ISO/IEC 27001:2022**: Vantrel has been certified since September 2023. The certificate covers the development, operation and support of Vantrel Plan. Surveillance audits are performed annually by an accredited certification body.
- **SOC 2 Type II**: Vantrel undergoes an annual SOC 2 Type II examination covering the Security, Availability and Confidentiality Trust Services Criteria. The audit period runs from January 1 to December 31, and the report is usually available in March of the following year.

The SOC 2 Type II report and the ISO 27001 certificate can be shared with customers and prospects under a non-disclosure agreement (NDA), on request to security@vantrel.example.

Vantrel does not store, process or transmit payment card data: subscription payments are handled by Stripe. PCI DSS certification is therefore not applicable to Vantrel Plan.

## Encryption

- **Data at rest**: all customer data stored in databases, file storage and backups is encrypted using AES-256, with keys managed in AWS Key Management Service (KMS). Keys are rotated automatically every year.
- **Data in transit**: all connections to Vantrel Plan use TLS 1.2 or higher. TLS 1.3 is preferred and negotiated whenever the client supports it. Older protocols (SSL, TLS 1.0 and 1.1) are disabled. HTTP Strict Transport Security (HSTS) is enforced.
- **Customer-managed keys (BYOK)**: Enterprise customers can provide and control their own encryption key through AWS KMS. Revoking the key makes the customer's data unreadable by Vantrel.

## Tenant isolation

Vantrel Plan is a multi-tenant application. Each customer's data is logically separated using a tenant identifier enforced at the database layer through row-level security policies. Each tenant also has its own encryption context. Automated tests run on every release to verify that one tenant cannot access another tenant's data.

## Secure development lifecycle

- All code changes require peer review and approval by at least one other engineer before being merged.
- Static application security testing (SAST) and dependency vulnerability scanning run automatically in the CI pipeline. Builds with critical findings are blocked.
- Engineers receive secure coding training (OWASP Top 10) during onboarding and annually.
- Production and development environments are strictly separated. Customer production data is never used in development or test environments.

## Employee security

- Background checks are performed on all new employees before their start date, where permitted by local law.
- All employees complete security and privacy awareness training during onboarding and then annually.
- Phishing simulation campaigns are run every quarter.
- Employees sign a confidentiality agreement as part of their employment contract.

## Endpoint security

All company laptops are managed through a Mobile Device Management (MDM) solution enforcing full-disk encryption, automatic screen lock, OS updates and an Endpoint Detection and Response (EDR) agent. Personal devices are not allowed to access production systems.

## Data retention and deletion

Customer data is retained for the duration of the subscription. After contract termination, customers have 30 days to export their data. Customer data is then permanently deleted from production systems within **90 days** of contract termination. Backups containing the data expire according to the backup retention schedule.
