---
name: step-04-proposal
description: "Synthesize PM + Architect challenges and propose an updated ticket version for user validation"
---

# Step 4 — Proposal & Validation

## STEP GOAL

Synthesize all findings from the PM and Architect challenges into an updated ticket version. Present it to the user for validation. Write the file only if the user approves.

## MANDATORY RULES

- 📖 Read this entire file before taking any action
- 🚫 **NEVER** write the updated ticket file without explicit user approval
- 💬 Present the proposed version clearly, section by section
- ⏸️ Always wait for user decision before writing anything

---

## EXECUTION

### 1. Synthesize Findings

Compile all findings from step-02 (PM) and step-03 (Architect) into a coherent picture:

- What was clear and kept as-is
- What was ambiguous and has been clarified (from user answers during challenge)
- What was missing and has been added
- Technical notes and implicit work to surface for the developer

### 2. Propose Updated Ticket

Present the proposed new version of the ticket in the Nakiros story format:

```markdown
---
id: [ticket ID]
title: [clear, action-oriented title]
persona: [persona from personas.md]
feature: [feature_name]
status: ready-for-dev
---

## User Story

As a [persona], I want [action] so that [value].

## Context

[Why this ticket exists, what it relates to in the product vision]

## Acceptance Criteria

- [ ] Given [context], when [action], then [expected result]
- [ ] Given [context], when [action], then [expected result]
- [ ] [Error case]: Given [context], when [action], then [expected result]

## Technical Notes

[From Architect challenge: dependencies, constraints, API changes needed]

## Tasks

- [ ] [Technical task 1 — from Architect challenge]
- [ ] [Technical task 2]
- [ ] [Implicit work identified: schema change, endpoint, config...]

## Out of Scope

[Explicit list of what this ticket does NOT cover, to prevent scope creep]
```

### 3. Ask for Validation

Present the proposed version and ask:

> "Voici la version challengée de ce ticket. Tu peux :
> - **[V] Valider** → j'écris le fichier mis à jour
> - **[M] Modifier** → dis-moi ce que tu veux changer
> - **[A] Abandonner** → on garde le ticket tel quel"

### 4. Handle User Response

#### If V (Validate):
- Write the updated ticket to its original file path (overwrite)
- Confirm: "✅ Ticket mis à jour : `[file path]`"
- Suggest next step: "Ce ticket est prêt pour `/nak-workflow-dev-story`."

#### If M (Modify):
- Apply the requested changes to the proposed version
- Present the updated proposal again
- Return to step 3

#### If A (Abandon):
- "Ok, le ticket original est conservé sans modification."
- Offer to share the challenge findings as a separate note if useful

---

## WORKFLOW COMPLETE

The challenge workflow is done. The ticket is either updated and ready for `dev-story`, or the user has chosen to keep the original.
