---
description: 'Run the Nakiros fetch-project-context workflow to gather scoped project/tool context'
disable-model-invocation: true
---

Command Trigger: `/nak-workflow-fetch-project-context`

## Workflow Intent

Collect project metadata, tool configuration, active branch details, and relevant prior decisions.

## Required Inputs

- `.nakiros.yaml`
- Current repository state
- Optional PM ticket id

## Output

- Context artifact in `.nakiros/workflows/steps/`
- Reusable context pointer for subsequent workflow steps
