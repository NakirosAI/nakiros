---
description: 'Run the Tiqora create-ticket workflow to create a structured ticket (bug, feature, task) in the PM tool'
disable-model-invocation: true
---

Command Trigger: `/tiq:workflow:create-ticket`

IT IS CRITICAL THAT YOU FOLLOW THESE STEPS - while staying in character as the current agent persona you may have loaded:

<steps CRITICAL="TRUE">
1. Always LOAD the FULL @_tiqora/core/tasks/workflow.xml
2. READ its entire contents - this is the CORE OS for EXECUTING the specific workflow-config @_tiqora/workflows/4-implementation/create-ticket/workflow.yaml
3. Pass the yaml path _tiqora/workflows/4-implementation/create-ticket/workflow.yaml as 'workflow-config' parameter to the workflow.xml instructions
4. Follow workflow.xml instructions EXACTLY as written to process and follow the specific workflow config and its instructions
5. Save outputs after EACH section when generating any documents from templates
</steps>
