---
name: step-01-load
description: "Load workspace context and identify the ticket to challenge"
nextStepFile: "./step-02-pm-challenge.md"
---

# Step 1 — Load Context & Ticket

## STEP GOAL

Load the workspace context and locate the ticket to challenge. Build a shared understanding of the project before any challenge begins.

## MANDATORY RULES

- 📖 Read this entire file before taking any action
- 🚫 Do not challenge or analyze anything in this step — only load and summarize
- 💬 Communicate in `{communication_language}`

---

## EXECUTION

### 1. Load Workspace Context

From `{workspace_context_root}`, load in this order:

- `product.md` — product vision and goals
- `personas.md` — user personas
- `dod.md` — Definition of Done
- `nfr.md` — non-functional constraints

If any of these files are missing, note it but continue.

### 2. Identify the Ticket

The ticket is a file synced by the orchestrator. It may be:

- Passed directly as an argument by the user
- Located in `{workspace_context_root}/../features/*/stories/*.md`
- Pasted inline by the user in the conversation

**If no ticket is provided**, ask:

> "Quel ticket souhaites-tu challenger ? Donne-moi le chemin du fichier ou colle son contenu directement."

Wait for the user to provide it before continuing.

### 3. Load the Relevant Feature Context

From the ticket content, identify which feature it belongs to.
Load `{workspace_context_root}/../features/{feature_name}/feature.md` if it exists.
Load `{workspace_context_root}/architecture/` index and relevant domain slice if the ticket has a technical scope.

### 4. Summarize What Was Loaded

Present a brief summary:

```
**Contexte chargé**
- Produit : [product.md résumé en 1 ligne]
- Personas disponibles : [liste des personas]
- Feature concernée : [feature_name ou "non identifiée"]
- Ticket : [titre ou ID du ticket]
```

If the feature cannot be identified from the ticket, ask the user before proceeding.

### 5. Proceed

Load and follow: `{nextStepFile}`
