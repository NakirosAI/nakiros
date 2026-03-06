---
description: 'Analyse les repos du workspace comme un contexte d''onboarding et d''exécution, puis génère les fichiers de contexte stables.'
disable-model-invocation: true
---

Command Trigger: `/nak-workflow-generate-context`

## Workflow Intent

Produce context files for the workspace:
- Per-repo: `{repo}/_nakiros/architecture.md`, `stack.md`, `conventions.md`, `api.md`, `llms.txt`
- Workspace-level: `~/.nakiros/workspaces/{workspace_slug}/context/global-context.md`, `product-context.md`, and `inter-repo.md` when needed

This workflow is **interactive**: it presents its findings before generating any files, and waits for explicit user confirmation.

---

## Execution

Read fully and follow: `~/.nakiros/workflows/4-implementation/generate-context/steps/step-01-discovery.md`
