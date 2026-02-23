---
description: 'Run the tiqora fetch-project-context workflow to gather scoped project/tool context'
disable-model-invocation: true
---

Command Trigger: `/tiq:workflow:fetch-project-context`

## Workflow Intent

Collect project metadata, tool configuration, active branch details, and relevant prior decisions.

## Required Inputs

- `.tiqora.yaml`
- Current repository state
- Optional PM ticket id

## Output

- Context artifact in `.tiqora/workflows/steps/`
- Reusable context pointer for subsequent workflow steps
