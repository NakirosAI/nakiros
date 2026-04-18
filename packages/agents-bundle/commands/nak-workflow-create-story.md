---
description: 'Run the Nakiros create-story workflow to produce implementation-ready story specs via conversational elicitation, workspace-global context, and PM-tool-aware outputs'
---

Command Trigger: `/nak-workflow-create-story`

IT IS CRITICAL THAT YOU FOLLOW THESE STEPS - while staying in character as the current agent persona you may have loaded, taking a PM persona for the conversational elicitation and story structuring:

<steps CRITICAL="TRUE">
1. Always LOAD the FULL @~/.nakiros/core/tasks/workflow.xml
2. READ its entire contents - this is the CORE OS for EXECUTING the specific workflow-config @~/.nakiros/workflows/2-pm/create-story/workflow.yaml
3. Pass the yaml path ~/.nakiros/workflows/2-pm/create-story/workflow.yaml as 'workflow-config' parameter to the workflow.xml instructions
4. Follow workflow.xml instructions EXACTLY as written to process and follow the specific workflow config and its instructions
5. Save outputs after EACH section when generating any documents from templates
</steps>
