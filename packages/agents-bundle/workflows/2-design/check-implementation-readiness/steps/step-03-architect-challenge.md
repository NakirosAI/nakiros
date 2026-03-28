---
name: step-03-architect-challenge
description: "Challenge the ticket from an Architect perspective: feasibility, dependencies, technical constraints"
nextStepFile: "./step-04-proposal.md"
---

# Step 3 — Architect Challenge

## STEP GOAL

As a Technical Architect, challenge the ticket against the known architecture, identify technical risks, dependencies, and constraints the developer must know before starting.

## MANDATORY RULES

- 📖 Read this entire file before taking any action
- 🚫 Do not speculate on implementation — challenge based on what is documented in `architecture/`
- 💬 Be precise. Vague technical notes are as bad as none
- ⏸️ If architecture context is insufficient to assess, say so clearly

---

## EXECUTION

### 1. Architecture Alignment Check

Using `{workspace_context_root}/architecture/` (index + relevant domain slices):

- Does the ticket align with the existing architecture decisions?
- Does it require introducing a new pattern, library, or component not currently in the stack?
- Does it conflict with any documented architectural constraint?

### 2. Dependency Check

- Does this ticket depend on another ticket or feature that is not yet done?
- Does it touch shared components, APIs, or services that other teams/tickets also depend on?
- Will it require a schema migration, an API change, or a breaking change?

Flag each dependency explicitly.

### 3. Technical Feasibility Check

- Is what is described technically feasible with the current stack (`stack.md`)?
- Are there performance or security constraints from `nfr.md` that apply here?
- Are there known edge cases at the infrastructure level (caching, concurrency, rate limits...)?

### 4. Implicit Technical Work & Tasks

Identify work the ticket does not mention but will be required. These will become the **Tasks** checklist in the final ticket:

- Schema or migration changes
- New endpoints (to document in `api.md`)
- Configuration or environment changes
- Test infrastructure or fixtures
- Any refactor required before the feature can land

Draft a preliminary task list — it will be refined in step-04.

### 5. Architect Challenge Summary

Present findings as:

```
**Architect Challenge — Résultats**

✅ Points validés :
- [ce qui est techniquement solide]

⚠️ Points de vigilance :
- [risques ou contraintes identifiés]

❌ Bloquants techniques :
- [ce qui empêche l'implémentation en l'état]

📋 Travail implicite identifié :
- [liste des tâches techniques non mentionnées dans le ticket]

❓ Questions techniques :
1. [question 1]
2. [question 2]
```

### 6. Wait for User Input (if blocking issues)

If technical blockers exist:
> "Ces bloquants techniques doivent être résolus avant de passer en dev-story. Veux-tu en discuter maintenant ?"

Wait for user response before proceeding.

### 7. Proceed

Load and follow: `{nextStepFile}`
