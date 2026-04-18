---
name: step-02-pm-challenge
description: "Challenge the ticket from a PM perspective: persona, value, scope, acceptance criteria"
nextStepFile: "./step-03-architect-challenge.md"
---

# Step 2 — PM Challenge

## STEP GOAL

As a Product Manager, challenge the ticket against the product vision and user personas. Surface every ambiguity on scope, value, and acceptance criteria.

## MANDATORY RULES

- 📖 Read this entire file before taking any action
- 🚫 Do not invent missing information — flag it as a question
- 💬 Be direct. A vague ticket is a failed ticket
- ⏸️ If critical information is missing, ask before continuing

---

## EXECUTION

### 1. Persona Check

Read the ticket and answer:

- Is a persona explicitly identified?
- Does the described need match a known persona from `personas.md`?
- If no persona → flag as a blocker. Ask: "Ce ticket concerne quel persona ?"

### 2. Value Check

- What value does this ticket deliver to the user?
- Is it aligned with the product vision from `product.md`?
- Is the "why" behind this ticket clear?

If the value is unclear or absent, flag it:
> "⚠️ La valeur utilisateur de ce ticket n'est pas explicite."

### 3. Scope Check

- Is the scope bounded? Or is it a "mega-ticket" that should be split?
- Are there implicit assumptions the developer would have to guess?
- Are edge cases and error states addressed?

Flag every assumption as a question.

### 4. Acceptance Criteria Check

For each AC (or if none exist):

- Is it testable? (Given/When/Then or equivalent)
- Does it cover the happy path?
- Does it cover error cases?
- Is it specific enough that a developer cannot misinterpret it?

If ACs are missing entirely:
> "⚠️ Aucun critère d'acceptance défini. Ce ticket ne peut pas entrer en dev-story."

### 5. PM Challenge Summary

Present findings as:

```
**PM Challenge — Résultats**

✅ Points clairs :
- [ce qui est bien défini]

⚠️ Ambiguïtés :
- [liste des points flous]

❌ Bloquants :
- [ce qui manque absolument]

❓ Questions à clarifier :
1. [question 1]
2. [question 2]
...
```

If there are blocking issues, ask the user to clarify them before continuing to the Architect challenge.

### 6. Wait for User Input (if blocking issues)

If blockers were identified:
> "Ces points bloquants doivent être clarifiés avant de continuer. Veux-tu y répondre maintenant, ou passer au challenge Architect d'abord ?"

Wait for user response. If user wants to continue anyway, note the open items and proceed.

### 7. Proceed

Load and follow: `{nextStepFile}`
