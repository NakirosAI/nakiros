---
description: 'Run the tiqora create-ticket workflow to draft and create a ticket in the configured PM tool'
disable-model-invocation: true
---

Command Trigger: `/tiq:workflow:create-ticket`

## Workflow Intent

Create a structured ticket with clear acceptance criteria and PM-aligned metadata.

## Required Inputs

- `.tiqora.yaml`
- Problem statement and expected outcome
- Priority and constraints

## Output

- Created ticket in configured PM tool (or queued sync if unavailable)
- Local ticket artifact for traceability in `.tiqora/workflows/steps/`
