---
description: 'Run the Nakiros fetch-project-context workflow to gather scoped project/tool context'
disable-model-invocation: true
---

Command Trigger: `/nak-workflow-fetch-project-context`

## Workflow Intent

Collect project metadata, tool configuration, active branch details, and relevant prior decisions.

## Required Inputs

- Current repository state
- `_nakiros/workspace.yaml` when the project is workspace-backed
- Optional PM ticket id

## Output

- Context artifact in `~/.nakiros/workspaces/{workspace_slug}/runs/steps/`
- Reusable context pointer for subsequent workflow steps
