---
title: "Nakiros Dev Story - Definition of Done Checklist"
validation-target: "Active ticket/story implementation run"
validation-criticality: "HIGHEST"
---

# Nakiros Dev Story - DoD Checklist

## 1) Config and Context

- [ ] Effective config built: `~/.nakiros/config.yaml` (optional) + project `.nakiros.yaml` (required).
- [ ] Required keys present: `pm_tool`, `git_host`, `branch_pattern`.
- [ ] Ticket retrieved via PM MCP or fallback explicitly confirmed.
- [ ] PM tracking identifiers (key/id, transitions, workspace IDs) captured.

## 2) Jira State Transitions (CRITICAL)

- [ ] **Step 3**: Ticket moved to `In Progress` immediately after fetch (worklog tracking started).
- [ ] **Step 4**: Challenge gate completed; artifact at `.nakiros/workflows/steps/{runId}-challenge.md` (ENGLISH).
- [ ] **Step 4**: Challenge summary comment posted to ticket with verdict, scope, risks.
- [ ] **Step 9**: Ticket moved to `Review` (or `Done` if no review stage) after commit and MR creation.
- [ ] **Step 9**: Final completion comment posted with MR link and time spent.

## 3) Challenge Gate (Rigorous)

- [ ] PM persona loaded from `~/.nakiros/agents/pm.md`.
- [ ] Challenge analyzed 6 dimensions: clarity, consistency, scope, alignment, testability, risks.
- [ ] Challenge artifact includes: intent, AC checklist, PM verdict (PASS/FAIL), scope boundaries, approach, risks, dependencies, testability notes.
- [ ] PM verdict is PASS (not vague "ok, let's go").
- [ ] Ambiguities resolved BEFORE implementation started.
- [ ] Persona restored to entry persona before implementation.

## 4) Implementation & Testing (Test-First)

- [ ] Dev persona loaded from `~/.nakiros/agents/dev.md`.
- [ ] Changes map 100% to approved challenge scope; no out-of-scope features.
- [ ] Tests written first (red), implementation (green), refactoring (refactor) when feasible.
- [ ] All unit tests passing.
- [ ] All regression tests passing.
- [ ] Lint/type/quality checks run and passing (if configured).
- [ ] At least one progress comment published during implementation (done/next/blockers format).

## 5) Git Commit (MANDATORY)

- [ ] Changes staged: `git add .`
- [ ] Commit created with conventional message format:
  - `feat:` for new features (or `fix:`, `refactor:`, `test:`)
  - Ticket ID in message: `Fixes {{ticketId}}`
  - Descriptive commit body with implementation details
- [ ] Commit includes all changes (no untracked files left).
- [ ] `git log` shows the commit on the branch.

## 6) MR Report

- [ ] MR Report generated at `.nakiros/workflows/runs/{runId}-mr-report.md` (in `document_language`).
- [ ] MR Report includes sections:
  - Title + Description (what was built and why)
  - Technical Choices (architecture decisions + justification)
  - Changes Made (file-by-file explanation)
  - Testing (unit/integration/manual steps)
  - How to Run (step-by-step instructions)
  - Deployment Notes (migrations, env vars, breaking changes, rollback plan)
- [ ] Developer reviewed and approved MR Report before push.
- [ ] MR/PR created in Git host (GitHub/GitLab) with MR Report as description.

## 7) Run-State and Traceability

- [ ] Branch name follows configured `branch_pattern`.
- [ ] Active run persisted to `.nakiros/state/active-run.json`.
- [ ] Run artifact persisted to `.nakiros/workflows/runs/{{runId}}.json` with:
  - ticketId, branchName, runId
  - Timestamps: challenge_started_at, implementation_started_at, mr_report_approved_at, completed_at
  - worklog_start_time (for final calculation)
  - final_mr_url (for traceability)
- [ ] Status transitions consistent: in_progress → review → completed.

## 8) Worklog Tracking

- [ ] Worklog tracking started at Step 3 (`worklog_start_time` captured).
- [ ] Worklog includes challenge + implementation time (from start to commit).
- [ ] Worklog computed: from {{worklog_start_time}} to commit time, rounded to {worklog_rounding_minutes} minutes, minimum {minimum_worklog_minutes} minutes.
- [ ] If timestamps unavailable, user explicitly provided time in minutes.
- [ ] Worklog pushed to PM tool (Jira/GitHub/etc.) at Step 9.

## 9) PM Sync (CRITICAL)

- [ ] **Challenge comment**: Posted with challenge verdict, scope, risks.
- [ ] **Progress comment(s)**: Posted during implementation (done/next/blockers).
- [ ] **Final comment**: Posted with MR link, time spent, validation evidence.
- [ ] **Status transitions**: In Progress (Step 3) → Review/Done (Step 9).
- [ ] **Worklog**: Pushed to PM tool.
- [ ] Any failed sync queued in `.nakiros/sync/queue.json` for retry.

## 10) Communication and Languages

- [ ] User-facing communication in `communication_language` (from config).
- [ ] Technical agent artifacts (challenge.md, implementation notes) in ENGLISH for agent performance.
- [ ] PM-facing content (Jira comments, MR Report) in `document_language`.
- [ ] Internal data files (.nakiros/ runs, JSON) in ENGLISH (agent performance).
- [ ] Commits in ENGLISH (dev standard).
- [ ] Output concise; no unnecessary internal execution noise.

## 11) Final Artifact Structure

- [ ] `.nakiros/workflows/runs/{{runId}}/` contains:
  - `{{runId}}.json` — run manifest (metadata, timestamps)
  - `{{runId}}-challenge.md` — challenge artifact (ENGLISH)
  - `{{runId}}-mr-report.md` — MR report (document_language)
  - Any additional implementation notes

## Final Result

- [ ] **PASS**: All items above satisfied. Workflow is complete and ready for code review.
- [ ] **FAIL**: Unresolved blockers listed with concrete next actions.
