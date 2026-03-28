---
title: "Nakiros Product Discovery — Definition of Done Checklist"
validation-target: "Product discovery from codebase (repo-scoped PM + Architect fan-out, Analyst-grade synthesis)"
validation-criticality: "HIGH"
---

# Nakiros Product Discovery — DoD Checklist

## 1) Workspace Loading

- [ ] `workspace.yaml` read from cwd (workspace dir).
- [ ] Canonical workspace yaml loaded from `~/.nakiros/workspaces/{workspace_slug}/workspace.yaml`.
- [ ] All repos mapped from canonical workspace yaml with roles and paths.
- [ ] Existing global, product, interRepo, and architecture context loaded when present.
- [ ] Existing product context loaded if present (will be enriched, not overwritten blindly).

## 2) Repo-Scoped Analysis — PM

- [ ] PM agent dispatched once per repo.
- [ ] Total PM runner count matches repo count.
- [ ] PM focus covered per repo: product value, users, workflows, problems solved.
- [ ] PM assessment of product maturity clues included per repo.
- [ ] PM findings persisted via nakiros-action context.workspace.set repo-scoped keys: `pm_analysis__{repo}`.

## 3) Repo-Scoped Analysis — Architect

- [ ] Architect agent dispatched once per repo.
- [ ] Total Architect runner count matches repo count.
- [ ] Architect focus covered per repo: stack, modules, entry points, API contracts, repo boundaries.
- [ ] Inter-repo dependencies inferred only after all repo-scoped findings are available.
- [ ] Key patterns, conventions, and fragile areas noted per repo.
- [ ] Architect findings persisted via nakiros-action context.workspace.set repo-scoped keys: `architect_analysis__{repo}`.

## 4) Workspace Synthesis

- [ ] Expected runner count in orchestration mode = `2 x repo_count`.
- [ ] All repo-scoped PM and Architect analyses loaded before synthesis.
- [ ] Synthesis uses Analyst discipline to connect repo-scoped product and technical perspectives.
- [ ] Unified document covers: what the product is, who it serves, what it does, technical shape.
- [ ] Current maturity assessed with evidence.
- [ ] Gaps and unknowns explicitly listed.
- [ ] Document in {{document_language}}.
- [ ] Persisted via nakiros-action context.workspace.set key: product.
- [ ] Persisted via nakiros-action context.workspace.set key: architecture.

## 5) User Presentation

- [ ] 5-7 sentence digest presented to user (not the full document).
- [ ] User offered the choice: brainstorming or done.
- [ ] If yes: brainstorming launched with product context pre-loaded.
- [ ] If no: user informed context is saved and how to use it later.

## 6) Communication

- [ ] All communication in communication_language.
- [ ] All documents in document_language.
- [ ] Internal artifacts in ENGLISH.

## Final Result

- [ ] **PASS**: Product context saved, user presented with clear findings, clear next step offered.
- [ ] **FAIL**: Analysis incomplete, synthesis missing key dimensions, or context not persisted.
