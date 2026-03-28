---
title: "Nakiros Dev Story - Definition of Done Checklist"
validation-target: "Active ticket/story implementation run"
validation-criticality: "HIGHEST"
---

# Nakiros Dev Story - DoD Checklist

## 1) Config and Context

- [ ] Effective context built: `~/.nakiros/config.yaml` + workspace settings/runtime.
- [ ] Required keys present: `pm_tool`, `git_host`, `branch_pattern`.
- [ ] Workspace-global context loaded before repo-local implementation detail.
- [ ] Ticket retrieved via the configured PM integration or fallback explicitly confirmed.
- [ ] PM tracking identifiers (key/id, transitions, workspace IDs) captured.
- [ ] Gitflow defaults/base branches resolved (`develop` for feature/bugfix, `main/master` for hotfix unless workspace overrides safely).

## 2) PM State Transitions (CRITICAL)

- [ ] **Step 3**: Ticket moved to `In Progress` immediately after fetch (worklog tracking started).
- [ ] **Step 4**: Challenge gate completed; artifact at `{workflow_steps_dir}/{runId}-challenge.md` (ENGLISH).
- [ ] **Step 4**: Challenge summary comment posted to ticket with verdict, scope, risks.
- [ ] **Step 9**: Ticket moved to `Review` (or `Done` if no review stage) after commit and review payload preparation.
- [ ] **Step 9**: Final completion comment posted with MR link and time spent.

## 3) Challenge Gate (Rigorous)

- [ ] PM persona loaded from `~/.nakiros/agents/pm.md`.
- [ ] Challenge analyzed 6 dimensions: clarity, consistency, scope, alignment, testability, risks.
- [ ] Challenge artifact includes: intent, AC checklist, PM verdict (PASS/FAIL), scope boundaries, approach, risks, dependencies, testability notes.
- [ ] Challenge artifact includes architect-defined technical task plan when available, or an explicit note that no task breakdown was found.
- [ ] PM verdict is PASS (not vague "ok, let's go").
- [ ] Ambiguities resolved BEFORE implementation started.
- [ ] Persona restored to entry persona before implementation.

## 4) Implementation & Testing (Test-First)

- [ ] Dev persona loaded from `~/.nakiros/agents/dev.md`.
- [ ] Implementation happens inside a dedicated worktree, never the repo's default checkout.
- [ ] Changes map 100% to approved challenge scope; no out-of-scope features.
- [ ] Architect-defined technical tasks are used as the execution source of truth when available.
- [ ] Task sequencing is respected (`back` before `front`, etc.) unless parallelization is explicitly safe.
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

## 6) Review Package

- [ ] MR Report generated at `{workflow_runs_dir}/{runId}-mr-report.md` (in `document_language`).
- [ ] MR/PR payload generated at `{workflow_runs_dir}/{runId}-mr-payload.json`.
- [ ] MR Report includes sections:
  - Title + Description (what was built and why)
  - Technical Task Execution Order
  - Technical Choices (architecture decisions + justification)
  - Changes Made (file-by-file explanation)
  - Testing (unit/integration/manual steps)
  - How to Run (step-by-step instructions)
  - Deployment Notes (migrations, env vars, breaking changes, rollback plan)
- [ ] Developer reviewed and approved MR Report before push.
- [ ] MR/PR creation is handed off through a Nakiros action or performed manually from the generated payload/report.

## 7) Run-State and Traceability

- [ ] Branch name follows configured `branch_pattern`.
- [ ] Base branch (`branch_base`) matches gitflow work type.
- [ ] Worktree path persisted in run state.
- [ ] Active run persisted to `{active_run_file}`.
- [ ] Run artifact persisted to `{workflow_runs_dir}/{{runId}}.json` with:
  - ticketId, branchName, branch_base, worktree_path, runId
  - Timestamps: challenge_started_at, implementation_started_at, mr_report_approved_at, completed_at
  - worklog_start_time (for final calculation)
  - mr_payload_path and final_mr_url (for traceability)
- [ ] Status transitions consistent: in_progress → review → completed.

## 8) Worklog Tracking

- [ ] Worklog tracking started at Step 3 (`worklog_start_time` captured).
- [ ] Worklog includes challenge + implementation time (from start to commit).
- [ ] Worklog computed: from {{worklog_start_time}} to commit time, rounded to {worklog_rounding_minutes} minutes, minimum {minimum_worklog_minutes} minutes.
- [ ] If timestamps unavailable, user explicitly provided time in minutes.
- [ ] Worklog pushed to the configured PM tool at Step 9.

## 9) PM Sync (CRITICAL)

- [ ] **Challenge comment**: Posted with challenge verdict, scope, risks.
- [ ] **Progress comment(s)**: Posted during implementation (done/next/blockers).
- [ ] **Final comment**: Posted with review package, MR payload, optional MR link, time spent, validation evidence.
- [ ] **Status transitions**: In Progress (Step 3) → Review/Done (Step 9).
- [ ] **Worklog**: Pushed to PM tool.
- [ ] Any failed sync queued in `{sync_queue_file}` for retry.

## 10) Communication and Languages

- [ ] User-facing communication in `communication_language` (from config).
- [ ] Technical agent artifacts (challenge.md, implementation notes) in ENGLISH for agent performance.
- [ ] PM-facing content (ticket comments, MR Report) in `document_language`.
- [ ] Internal data files under `{workspace_root_dir}` (runs, JSON) in ENGLISH (agent performance).
- [ ] Commits in ENGLISH (dev standard).
- [ ] Output concise; no unnecessary internal execution noise.

## 11) Final Artifact Structure

- [ ] `{workflow_runs_dir}/{{runId}}/` contains:
  - `{{runId}}.json` — run manifest (metadata, timestamps)
  - `{{runId}}-challenge.md` — challenge artifact (ENGLISH)
  - `{{runId}}-mr-report.md` — MR report (document_language)
  - `{{runId}}-mr-payload.json` — SCM action payload for MR/PR creation
  - Any additional implementation notes

## Final Result

- [ ] **PASS**: All items above satisfied. Workflow is complete and ready for code review.
- [ ] **FAIL**: Unresolved blockers listed with concrete next actions.
