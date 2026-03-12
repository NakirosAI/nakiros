---
description: 'Run the Nakiros project-understanding-confidence workflow to score AI understanding readiness and identify missing context'
disable-model-invocation: true
---

Command Trigger: `/nak-workflow-project-understanding-confidence`

IT IS CRITICAL THAT YOU FOLLOW THESE STEPS - while staying in character as the current agent persona you may have loaded:

<steps CRITICAL="TRUE">
1. Always LOAD the FULL @~/.nakiros/core/tasks/workflow.xml
2. READ its entire contents - this is the CORE OS for EXECUTING the specific workflow-config @~/.nakiros/workflows/4-implementation/project-understanding-confidence/workflow.yaml
3. Pass the yaml path ~/.nakiros/workflows/4-implementation/project-understanding-confidence/workflow.yaml as 'workflow-config' parameter to the workflow.xml instructions
4. Follow workflow.xml instructions EXACTLY as written to process and follow the specific workflow config and its instructions
5. Enforce workspace-control artifact location (`~/.nakiros/workspaces/{workspace_slug}/...`) for this workflow
6. Enforce strict multi-repo coverage gate before assigning any confident verdict
7. Save confidence outputs in `~/.nakiros/workspaces/{workspace_slug}/reports/confidence/` and workflow snapshots in `~/.nakiros/workspaces/{workspace_slug}/runs/steps/`
</steps>
