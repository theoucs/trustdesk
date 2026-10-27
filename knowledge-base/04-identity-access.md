---
title: Identity and Access Management
version: 2026.1
last_updated: 2026-02-10
owner: Product Security
---

# Identity and Access Management

## Customer authentication

Vantrel Plan supports the following authentication methods for customer users:

- **Email and password**: passwords must contain at least 12 characters and are checked against known breached password lists. Passwords are hashed with Argon2id.
- **Multi-factor authentication (MFA)**: users can enable MFA using a TOTP authenticator app or a FIDO2/WebAuthn security key. Administrators can make MFA mandatory for all users of their workspace. SMS-based MFA is not supported.
- **Single Sign-On (SSO)**: SAML 2.0 and OpenID Connect (OIDC) are supported on Business and Enterprise plans. Tested identity providers include Microsoft Entra ID, Okta and Google Workspace. When SSO is enforced, password login is disabled for the workspace.

Sessions expire after 12 hours by default. Workspace administrators can configure a shorter session timeout.

## User provisioning

User provisioning and deprovisioning through **SCIM 2.0** is available on the Enterprise plan. On other plans, users are managed manually by workspace administrators.

## Roles and permissions

Vantrel Plan uses role-based access control (RBAC) with four default roles:

- **Admin**: manages users, security settings and billing.
- **Modeler**: creates and edits models, dimensions and calculations.
- **Contributor**: enters and edits data in the areas they are assigned to.
- **Viewer**: read-only access to boards and reports.

In addition, access to data can be restricted at the dimension-member level (for example, a sales manager can only see their own region). Custom roles are not currently supported.

## Audit logs

Vantrel Plan records an audit trail of user activity, including logins, permission changes, model changes and data exports. Audit logs are retained for 13 months and can be exported through the API or viewed in the administration console. Enterprise customers can stream audit logs to their SIEM via webhook.

## Vantrel employee access to customer data

Vantrel employees do not have standing access to customer data. Support engineers can only access a customer workspace when the customer grants temporary access from the administration console. Access is time-limited (maximum 72 hours), logged, and visible to the customer in the audit trail.

Access rights of Vantrel employees to internal systems are reviewed quarterly, and access is revoked within 24 hours when an employee leaves the company.
