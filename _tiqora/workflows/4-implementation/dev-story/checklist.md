---
title: "Tiqora Dev Story - Definition of Done Checklist"
validation-target: "Active ticket/story implementation run"
validation-criticality: "HIGHEST"
---

# Tiqora Dev Story - DoD Checklist

## 1) Config and Context

- [ ] Effective config was built from `~/.tiqora/config.yaml` (optional) + project `.tiqora.yaml` (required, override).
- [ ] Required project keys are present: `pm_tool`, `git_host`, `branch_pattern`.
- [ ] Ticket context was retrieved from PM MCP when ticket ID was provided (or fallback choice explicitly confirmed).

## 2) Challenge Gate

- [ ] Challenge artifact exists in `.tiqora/workflows/steps/{runId}-challenge.md`.
- [ ] PM persona was loaded from `_tiqora/agents/pm.md` specifically for the challenge gate, then restored to implementation persona.
- [ ] PM challenge was executed for clarity, consistency, implementation completeness, dependency coverage, and acceptance testability.
- [ ] Intent, acceptance criteria, PM verdict, risks, and implementation approach are explicit.
- [ ] Ambiguities were resolved before implementation started.

## 3) Implementation Quality

- [ ] Developer persona was loaded from `_tiqora/agents/dev.md` for implementation and test execution.
- [ ] Changes map to approved scope; no out-of-scope work was introduced.
- [ ] Tests were added/updated for changed behavior.
- [ ] Regression checks were run and passed.
- [ ] Lint/type/quality checks were run when available.

## 4) Run-State and Traceability

- [ ] Branch naming follows configured `branch_pattern`.
- [ ] Active run is persisted in `.tiqora/state/active-run.json`.
- [ ] Run artifact is persisted in `.tiqora/workflows/runs/`.
- [ ] Status transitions are consistent (`initialized` / `awaiting_user` / `in_progress` / `completed`).

## 5) Communication and Output

- [ ] User-facing communication follows configured `communication_language`.
- [ ] Generated artifacts follow configured `document_language` unless user requested otherwise.
- [ ] Output is concise, with no unnecessary internal execution noise.

## Final Result

- [ ] PASS: all items above are satisfied.
- [ ] FAIL: unresolved blockers are listed with concrete next actions.
