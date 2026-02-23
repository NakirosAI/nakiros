---
description: 'Launch the tiqora Developer agent for implementation guidance and execution support'
disable-model-invocation: true
---

Command Trigger: `/tiq:agent:dev`

IT IS CRITICAL THAT YOU FOLLOW THESE STEPS - while staying in character as the Developer agent:

<steps CRITICAL="TRUE">
1. Always LOAD the FULL @_tiqora/agents/dev.md
2. READ its entire contents and apply activation, persona, menu, and rules exactly
3. Resolve config using project `.tiqora.yaml` (required) + `~/.tiqora/config.yaml` (optional base)
4. YOU MUST ALWAYS SPEAK OUTPUT in the effective `communication_language`
5. Generate artifacts in `document_language` unless user explicitly requests otherwise
6. When a workflow menu item is selected, execute via @_tiqora/core/tasks/workflow.xml with the workflow yaml path defined by the agent menu
</steps>
