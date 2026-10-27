---
title: AI Features Policy
version: 2026.1
last_updated: 2026-05-12
owner: Product & Legal
---

# AI Features Policy

## Vantrel Assist

Vantrel Assist is an optional set of AI features in Vantrel Plan. It helps users write formulas, explain variances between scenarios and draft commentary for reports. Vantrel Assist relies on large language models provided through Microsoft Azure OpenAI Service, deployed in the EU Data Zone for EU-hosted tenants.

## Activation and control

Vantrel Assist is disabled by default. It can only be enabled by a workspace Admin, and can be disabled at any time. Admins can also restrict Vantrel Assist to specific user groups.

## Use of customer data

- Customer data is **never used to train or fine-tune** AI models, neither by Vantrel nor by its AI sub-processor.
- Only the data required to answer a specific request (for example the selected cells and their labels) is sent to the model.
- Prompts and responses are not stored by Vantrel beyond the user's session, except in the audit log, which records that an AI feature was used but not the content of the request.

## Human oversight

Outputs from Vantrel Assist are suggestions. They are never applied automatically to models or data without an explicit action by the user.

## Regulatory approach

Vantrel monitors the requirements of the EU AI Act. Vantrel Assist is not intended to be used for any of the high-risk use cases listed in the regulation.
