---
title: "Nakiros Create-Story - Definition of Done Checklist"
validation-target: "New story creation run (conversational elicitation)"
validation-criticality: "HIGH"
---

# Nakiros Create-Story - DoD Checklist

## 1) Configuration & Setup

- [ ] Effective context built from `~/.nakiros/config.yaml` + workspace settings/runtime.
- [ ] Required key present: `pm_tool` (`branch_pattern` may be loaded as advisory context only).
- [ ] Ready to discuss story with user.

## 2) Story Discussion (Natural Conversation)

- [ ] User described what they want to build/fix.
- [ ] Agent asked clarifying questions (not as a form, as natural conversation).
- [ ] Problem statement captured and understood.
- [ ] Expected outcome discussed and clear.
- [ ] User/stakeholder identified.
- [ ] Priority discussed (low/medium/high/critical).
- [ ] Scope boundaries discussed (what's in, what's out).

## 3) Acceptance Criteria (Conversational)

- [ ] User explained how they'd know when it's done.
- [ ] Agent clarified measurable outcomes (3-5 criteria).
- [ ] ACs captured in natural language (format not forced).
- [ ] Both agent and user agree on what "done" means.
- [ ] No critical ambiguities remain.

## 4) Dependencies & Gotchas (Discussed)

- [ ] Blockers/dependencies discussed naturally (if any).
- [ ] Risks or tricky parts identified.
- [ ] Impact on ecosystem considered.
- [ ] (May be "none" for simple stories - that's ok)

## 5) Story Document (From Our Conversation)

- [ ] Story title generated from problem statement (max 80 chars, searchable).
- [ ] Stable `story_slug` generated for local artifact persistence before PM sync.
- [ ] Story description summarizes what we discussed:
  - Problem statement (our words)
  - Expected outcome
  - User/Stakeholder
  - Priority
  - Acceptance criteria (as we described them)
  - Scope (in/out)
  - Dependencies & risks (if any)
- [ ] Document is clear enough for dev to challenge and implement.

## 6) User Approval

- [ ] Story document displayed to user.
- [ ] User reviewed and confirmed it matches their intent.
- [ ] Any edits applied before creation.
- [ ] User explicitly approved creation.

## 7) PM Tool Creation

- [ ] If `pm_tool` is configured: story created via the Nakiros PM action layer / configured connector.
- [ ] If `pm_tool` is configured: story ID/Key captured as {{ticketId}}.
- [ ] If `pm_tool` is configured: story is accessible and viewable in the PM tool.
- [ ] If no PM tool or creation failed: story remains usable locally with optional sync queued.

## 8) Local Artifact Persistence

 - [ ] Story artifact persisted to `{story_artifact_dir}/{{story_slug}}.json`.
- [ ] Includes all discussion details (problem, outcome, ACs, scope, etc).
- [ ] Includes metadata (`story_slug`, pm_tool, document_language, created_at, and PM ticket metadata if available).

## 9) Communication and Languages

- [ ] Conversation with user in `communication_language` (from config).
- [ ] Story content (ticket title, descriptions, comments) in `document_language`.
- [ ] Internal JSON artifacts under `{workspace_root_dir}` remain in ENGLISH (agent performance).
- [ ] Commits in ENGLISH (dev standard).
- [ ] Clear next steps offered (dev-story, view, etc).

## Final Result

- [ ] **PASS**: Story created from natural discussion, ready for dev-story challenge.
- [ ] **FAIL**: Unresolved ambiguities or user not satisfied with story.
