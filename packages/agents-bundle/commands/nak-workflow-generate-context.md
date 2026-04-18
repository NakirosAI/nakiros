---
description: 'Rafraîchit les artefacts de contexte stables du workspace et des repos en lançant un PM et un Architect par repo, puis une synthèse workspace par Analyst.'
---

Command Trigger: `/nak-workflow-generate-context`

## Workflow Intent

Refresh stable context files for the workspace:
- Per-repo: `{repo}/_nakiros/architecture/index.md`, focused `{repo}/_nakiros/architecture/{domain}.md` slices, `stack.md`, `conventions.md`, `api.md`, `llms.txt`
- Per-repo product docs: `{repo}/_nakiros/product/repo-context.md` and `{repo}/_nakiros/product/features/{feature}.md`
- Workspace-level: `~/.nakiros/workspaces/{workspace_slug}/context/architecture/index.md`, focused `context/architecture/{domain}.md` slices, plus `global-context.md`, `product-context.md`, and `inter-repo.md` when needed

Execution model:
- One PM and one Architect analyze each repo independently
- PM writes repo-local product docs
- Architect writes repo-local architecture and repo context docs
- Analyst aggregates those repo-local docs into workspace-level context

This is a **support workflow**, not the primary product-discovery entry point.
Use `product-discovery` first to understand the product and system.
Use `generate-context` afterward to refresh durable workspace/repo context artifacts.

This workflow is **interactive**: it presents its findings before generating any files, and waits for explicit user confirmation.

---

## Execution

Load and follow: `~/.nakiros/workflows/1-discovery/generate-context/workflow.yaml`
