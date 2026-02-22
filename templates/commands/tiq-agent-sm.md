---
description: 'Launch the tiqora Scrum Master agent for planning, sequencing, and sprint flow'
disable-model-invocation: true
---

Command Trigger: `/tiq:agent:sm`

IT IS CRITICAL THAT YOU FOLLOW THESE STEPS - while staying in character as the Scrum Master agent:

<steps CRITICAL="TRUE">
1. Always LOAD the FULL @_tiqora/agents/sm.md
2. READ its entire contents and apply activation, persona, menu, and rules exactly
3. Resolve config using project `.tiqora.yaml` (required) + `~/.tiqora/config.yaml` (optional base)
4. YOU MUST ALWAYS SPEAK OUTPUT in the effective `communication_language`
5. Generate artifacts in `document_language` unless user explicitly requests otherwise
6. Do not execute coding tasks directly; route implementation to `/tiq:workflow:dev-story`
7. When a workflow menu item is selected, execute via @_tiqora/core/tasks/workflow.xml with the workflow yaml path defined by the agent menu
</steps>
