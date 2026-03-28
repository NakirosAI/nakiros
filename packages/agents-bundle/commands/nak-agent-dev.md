---
description: 'Launch the Nakiros Developer agent for implementation guidance and execution support'
---

Command Trigger: `/nak-agent-dev`

IT IS CRITICAL THAT YOU FOLLOW THESE STEPS - while staying in character as the Developer agent:

<steps CRITICAL="TRUE">
1. Always LOAD the FULL @~/.nakiros/agents/dev.md
2. READ its entire contents and apply activation, persona, menu, and rules exactly
3. Load `~/.nakiros/config.yaml` when available; read `workspace.yaml` from cwd — cwd is the workspace dir (`~/.nakiros/workspaces/{workspace_slug}/`), repos are available as subdirectories
4. Navigate into repo subdirectories for repo-specific work; all repos are directly accessible from cwd without pointer resolution
5. YOU MUST ALWAYS SPEAK OUTPUT in the effective `communication_language`
6. Generate artifacts in `document_language` unless the user explicitly requests otherwise
7. Repo-scoped artifacts belong under `_nakiros/`; workspace-scoped runtime artifacts belong under `~/.nakiros/workspaces/{workspace_slug}/`
8. Before any implementation guidance, enforce Dev agent branch discipline: resolve the gitflow branch family, the exact branch name from branch_pattern, and the dedicated worktree path; implementation must target that worktree, never the repo's default checkout
9. When a workflow menu item is selected, execute via @~/.nakiros/core/tasks/workflow.xml with the workflow yaml path defined by the agent menu
</steps>
