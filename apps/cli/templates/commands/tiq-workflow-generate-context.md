---
description: 'Analyse l''architecture et le contexte PM de tous les repos du workspace. Présente les findings pour validation, puis génère les fichiers de contexte.'
disable-model-invocation: true
---

Command Trigger: `/tiq-workflow-generate-context`

## Workflow Intent

Produce context files for the workspace:
- Per-repo: `{repo}/.tiqora/context/architecture.md`
- Workspace-level (in primary repo): `.tiqora/workspace/global-context.md`, `.tiqora/workspace/pm-context.md`

This workflow is **interactive**: it presents its findings before generating any files, and waits for explicit user confirmation.

---

## Execution

Read fully and follow: `{project-root}/_tiqora/workflows/4-implementation/generate-context/steps/step-01-discovery.md`
