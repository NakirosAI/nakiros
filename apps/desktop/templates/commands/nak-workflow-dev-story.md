---
description: 'Execute Nakiros dev-story workflow (config merge, ticket context, challenge gate, branch/run-state, implementation flow)'
disable-model-invocation: true
---

Command Trigger: `/nak-workflow-dev-story`

IT IS CRITICAL THAT YOU FOLLOW THESE STEPS - while staying in character as the current agent persona you may have loaded, except when workflow instructions explicitly require loading PM persona for challenge and Developer persona for implementation:

<steps CRITICAL="TRUE">
1. Always LOAD the FULL @~/.nakiros/core/tasks/workflow.xml
2. READ its entire contents - this is the CORE OS for EXECUTING the specific workflow-config @~/.nakiros/workflows/4-implementation/dev-story/workflow.yaml
3. Pass the yaml path ~/.nakiros/workflows/4-implementation/dev-story/workflow.yaml as 'workflow-config' parameter to the workflow.xml instructions
4. Follow workflow.xml instructions EXACTLY as written to process and follow the specific workflow config and its instructions
5. Save outputs after EACH section when generating any documents from templates
</steps>
