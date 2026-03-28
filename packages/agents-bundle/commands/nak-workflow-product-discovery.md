---
description: 'Analyse la codebase existante repo par repo avec un couple PM + Architect par repo, puis synthétise un contexte produit et une carte d’architecture globale de workspace avant de proposer un brainstorming.'
---

Command Trigger: `/nak-workflow-product-discovery`

## Workflow Intent

Understand what an existing product does by analyzing its codebase:
- One PM and one Architect analyze each repo independently
- Repo-scoped findings are then synthesized at workspace level with Analyst discipline
- Produces a workspace-global product context and architecture map
- Proposes a brainstorming session pre-loaded with the discovered context

---

## Execution

Load and follow: `~/.nakiros/workflows/1-discovery/product-discovery/workflow.yaml`
