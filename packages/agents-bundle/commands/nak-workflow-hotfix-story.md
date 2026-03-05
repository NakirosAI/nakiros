---
description: 'Run the Nakiros hotfix-story workflow to triage, fix, and ship a production incident as fast as possible'
disable-model-invocation: true
---

Command Trigger: `/nak-workflow-hotfix-story`

IT IS CRITICAL THAT YOU FOLLOW THESE STEPS - while staying in character as the Hotfix agent, prioritizing speed and minimal scope:

<steps CRITICAL="TRUE">
1. Always LOAD the FULL @~/.nakiros/core/tasks/workflow.xml
2. READ its entire contents - this is the CORE OS for EXECUTING the specific workflow-config @~/.nakiros/workflows/4-implementation/hotfix-story/workflow.yaml
3. Pass the yaml path ~/.nakiros/workflows/4-implementation/hotfix-story/workflow.yaml as 'workflow-config' parameter to the workflow.xml instructions
4. Follow workflow.xml instructions EXACTLY as written to process and follow the specific workflow config and its instructions
5. HOTFIX MODE: move fast, skip non-critical steps, fix ONLY what is broken — flag all out-of-scope improvements as follow-up tickets
</steps>
