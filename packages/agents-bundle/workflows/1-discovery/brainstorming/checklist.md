---
title: "Nakiros Brainstorming — Definition of Done Checklist"
validation-target: "Brainstorming session (PRD generation)"
validation-criticality: "HIGH"
---

# Nakiros Brainstorming — DoD Checklist

## 1) Setup

- [ ] `workspace.yaml` read from cwd (workspace dir).
- [ ] Canonical workspace yaml loaded from `~/.nakiros/workspaces/{workspace_slug}/workspace.yaml`.
- [ ] Workspace context loaded (`context.workspace.get` for product/global/interRepo/architecture).
- [ ] Existing product context loaded if present (pre-loaded from product-discovery).
- [ ] Session framed: user knows the goal is to produce a PRD.

## 2) WHY — Problem exploration

- [ ] Problem statement captured in one crisp sentence.
- [ ] Affected users identified (who, how often, how badly).
- [ ] Current situation without solution described (workarounds, friction, cost).
- [ ] Motivation clear: why this problem, why now.
- [ ] No solution discussed yet at this stage.

## 3) WHAT — Desired outcome

- [ ] Desired outcome stated from the user's perspective.
- [ ] Target personas defined (who they are, their goals, their context).
- [ ] Success metrics identified (how we'd know it worked).
- [ ] Constraints captured (non-negotiables).
- [ ] Key assumptions surfaced and noted.

## 4) HOW — Solution direction

- [ ] Multiple solution directions explored (not just one).
- [ ] Trade-offs discussed for each direction.
- [ ] User selected or proposed a direction.
- [ ] v1 scope defined: what's in, what's out.
- [ ] Open questions listed for future validation.

## 5) PRD Generation

- [ ] PRD generated in {{document_language}}.
- [ ] Includes: context, target users, problem, desired outcome, metrics.
- [ ] Includes: solution direction, v1 scope, out-of-scope, constraints, assumptions.
- [ ] Includes: open questions section.
- [ ] PRD is actionable for PM (stories) and Architect (technical planning).

## 6) User Approval

- [ ] PRD displayed to user for review.
- [ ] User reviewed and confirmed it captures the session.
- [ ] Any edits applied before saving.
- [ ] User explicitly approved saving.

## 7) Persistence

- [ ] PRD persisted via nakiros-action `context.workspace.set` key: product.
- [ ] Clear next steps offered (PM workflow, view, done).

## 8) Communication

- [ ] Entire conversation in communication_language.
- [ ] PRD content in document_language.
- [ ] One question at a time throughout (no interrogation pattern).
- [ ] WHY explored before WHAT, WHAT before HOW (no premature solution design).

## Final Result

- [ ] **PASS**: PRD saved, user satisfied, ready for PM and Architect.
- [ ] **FAIL**: PRD incomplete, user not satisfied, or critical gaps remain.
