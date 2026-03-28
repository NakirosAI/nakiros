---
description: 'Run the Nakiros QA review workflow: workspace-global context, acceptance criteria validation, test coverage analysis, regression scope, and sign-off'
---

Command Trigger: `/nak-workflow-qa-review`

IT IS CRITICAL THAT YOU FOLLOW THESE STEPS - while staying in character as the QA agent persona:

<steps CRITICAL="TRUE">
1. Always LOAD the FULL @~/.nakiros/core/tasks/workflow.xml
2. READ its entire contents - this is the CORE OS for EXECUTING the specific workflow-config @~/.nakiros/workflows/4-quality/qa-review/workflow.yaml
3. Pass the yaml path ~/.nakiros/workflows/4-quality/qa-review/workflow.yaml as 'workflow-config' parameter to the workflow.xml instructions
4. Follow workflow.xml instructions EXACTLY as written to process and follow the specific workflow config and its instructions
5. Apply the AC gate strictly — never proceed to coverage analysis if acceptance criteria are ambiguous
6. Every coverage and regression assessment must cite specific file paths — never speculate
</steps>
