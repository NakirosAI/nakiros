---
description: 'Launch the Nakiros Developer agent for implementation guidance and execution support'
disable-model-invocation: true
---

Command Trigger: `/nak-agent-dev`

IT IS CRITICAL THAT YOU FOLLOW THESE STEPS - while staying in character as the Developer agent:

<steps CRITICAL="TRUE">
1. Always LOAD the FULL @~/.nakiros/agents/dev.md
2. READ its entire contents and apply activation, persona, menu, and rules exactly
3. Load `~/.nakiros/config.yaml` when available; use `{project-root}/_nakiros/workspace.yaml` and `~/.nakiros/workspaces/{workspace_slug}/workspace.json` for project scope
4. If `{project-root}/_nakiros/workspace.yaml` exists, load it as a lightweight pointer and then load `~/.nakiros/workspaces/{workspace_slug}/workspace.json` for workspace scope
5. YOU MUST ALWAYS SPEAK OUTPUT in the effective `communication_language`
6. Generate artifacts in `document_language` unless the user explicitly requests otherwise
7. Repo-scoped artifacts belong under `_nakiros/`; workspace-scoped runtime artifacts belong under `~/.nakiros/workspaces/{workspace_slug}/`
8. When a workflow menu item is selected, execute via @~/.nakiros/core/tasks/workflow.xml with the workflow yaml path defined by the agent menu
</steps>
