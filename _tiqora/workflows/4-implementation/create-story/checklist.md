---
title: "Tiqora Create-Story - Definition of Done Checklist"
validation-target: "New story creation run (conversational elicitation)"
validation-criticality: "HIGH"
---

# Tiqora Create-Story - DoD Checklist

## 1) Configuration & Setup

- [ ] Effective config built from `~/.tiqora.yaml` + project `.tiqora.yaml`.
- [ ] Required keys present: `pm_tool`, `git_host`, `branch_pattern`.
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

- [ ] Story created in {{pm_tool}} using MCP connector.
- [ ] Story ID/Key captured as {{ticketId}}.
- [ ] Story is accessible and viewable in PM tool.
- [ ] (If creation failed, locally saved with sync queued)

## 8) Local Artifact Persistence

- [ ] Story artifact persisted to `.tiqora/workflows/stories/{{ticketId}}.json`.
- [ ] Includes all discussion details (problem, outcome, ACs, scope, etc).
- [ ] Includes metadata (pm_tool, git_host, document_language, created_at).

## 9) Communication and Languages

- [ ] Conversation with user in `communication_language` (from config).
- [ ] Story content (Jira ticket, descriptions, comments) in `document_language`.
- [ ] Internal JSON artifacts (.tiqora/ files) in ENGLISH (agent performance).
- [ ] Commits in ENGLISH (dev standard).
- [ ] Clear next steps offered (dev-story, view, etc).

## Final Result

- [ ] **PASS**: Story created from natural discussion, ready for dev-story challenge.
- [ ] **FAIL**: Unresolved ambiguities or user not satisfied with story.
