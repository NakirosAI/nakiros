---
description: 'Run the tiqora create-story workflow to produce implementation-ready story specs'
disable-model-invocation: true
---

Command Trigger: `/tiq:workflow:create-story`

## Workflow Intent

Generate a structured story with clear acceptance criteria and implementation scope.

## Required Inputs

- Project context from `.tiqora.yaml`
- Ticket intent or problem statement
- Delivery constraints

## Output

- Story artifact in `.tiqora/workflows/steps/`
- Updated sprint tracking status
