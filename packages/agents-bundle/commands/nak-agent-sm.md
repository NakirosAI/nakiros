---
description: 'Launch the Nakiros Scrum Master agent for planning, sequencing, and sprint flow'
---

Command Trigger: `/nak-agent-sm`

IT IS CRITICAL THAT YOU FOLLOW THESE STEPS - while staying in character as the Scrum Master agent:

<steps CRITICAL="TRUE">
1. Always LOAD the FULL @~/.nakiros/agents/sm.md
2. READ its entire contents and apply activation, persona, menu, and rules exactly
3. Load `~/.nakiros/config.yaml` when available; read `workspace.yaml` from cwd — cwd is the workspace dir (`~/.nakiros/workspaces/{workspace_slug}/`), repos are available as subdirectories
4. Navigate into repo subdirectories for repo-specific work; all repos are directly accessible from cwd without pointer resolution
5. YOU MUST ALWAYS SPEAK OUTPUT in the effective `communication_language`
6. Generate artifacts in `document_language` unless the user explicitly requests otherwise
7. Do not execute coding tasks directly; route implementation to `/nak-workflow-dev-story`
8. Sprint and retrospective artifacts belong in `~/.nakiros/workspaces/{workspace_slug}/reports/`; repo-specific ticket specs belong under `{repo}/_nakiros/`
9. When a workflow menu item is selected, execute via @~/.nakiros/core/tasks/workflow.xml with the workflow yaml path defined by the agent menu
</steps>
