---
title: "Nakiros Project Understanding Confidence - Validation Checklist"
validation-target: "Workspace onboarding confidence report"
validation-criticality: "HIGHEST"
---

# Project Understanding Confidence - Checklist

## 1) Scope and Execution Repository

- [ ] Execution repository mode is `workspace-control` (enforced).
- [ ] Confidence artifact path points to workspace control root (`{project-root}/.nakiros/...`).
- [ ] Workspace scope resolved (single-repo or multi-repo).
- [ ] All repos in scope were analyzed (no partial scan).
- [ ] Repo list in report includes role and local path.

## 2) Mandatory Evidence Coverage (Per Repo)

- [ ] Category A covered for each repo: required tech + required skills + available capabilities.
- [ ] Category B covered for each repo: functional understanding with file references.
- [ ] Category C covered for each repo: documentation + ticketing readiness.
- [ ] Category D covered for each repo: testability readiness with runnable commands/prereqs.
- [ ] Category E covered for each repo: operational readiness (CI/CD/deploy/runbook signals).
- [ ] Every confidence claim is evidence-backed with concrete file paths or observable repo signals.

## 3) Repo Coverage Gate

- [ ] Repo coverage matrix exists with one row per repo and A/B/C/D/E status.
- [ ] `repo_coverage_percent` is computed.
- [ ] Coverage gate rule is applied:
  - `< {minimum_repo_coverage_percent}` => gate failed, score capped, verdict cannot be CONFIDENT.
  - `>= {minimum_repo_coverage_percent}` => gate passed.

## 4) Scoring Integrity

- [ ] Five dimensions are scored: `skill_coverage`, `project_understanding`, `documentation_ticket_readiness`, `testability_readiness`, `operational_readiness`.
- [ ] Each dimension score is between 0 and 100.
- [ ] Weighted global score formula uses workflow weights exactly.
- [ ] Final score applies coverage cap when coverage gate fails.
- [ ] Threshold-based verdict is correctly derived:
  - `>= {score_threshold_confident}` => CONFIDENT (only if coverage gate passed)
  - `>= {score_threshold_partial}` and `< {score_threshold_confident}` => PARTIAL
  - `< {score_threshold_partial}` => INSUFFICIENT

## 5) Actionability for User Performance

- [ ] Critical blocking gaps are listed and prioritized.
- [ ] Recommended non-blocking gaps are listed separately.
- [ ] Action backlog exists with priority, action, why, affected repos, verification, effort, expected gain.
- [ ] Quick wins and structural actions are separated.
- [ ] A +20 confidence boost plan is provided.

## 6) Artifacts

- [ ] Markdown report written to `{chosen_repo}/.nakiros/workspace/confidence/`.
- [ ] JSON report written to `{chosen_repo}/.nakiros/workspace/confidence/`.
- [ ] Workflow snapshot written to `{chosen_repo}/.nakiros/workflows/steps/`.
- [ ] Report includes: coverage gate, repo matrix, scoring breakdown, understanding proof, skill fit, test readiness, action backlog.
- [ ] Report includes execution repository mode and artifact repository path.

## 7) Communication

- [ ] User-facing communication is in `communication_language`.
- [ ] Confidence report is in `document_language`.
- [ ] Internal machine fields are in English.

## Final Result

- [ ] **PASS**: Confidence report is complete, multi-repo grounded, and action-oriented.
- [ ] **FAIL**: Missing evidence/coverage/scoring/actionability details documented with remediation steps.
