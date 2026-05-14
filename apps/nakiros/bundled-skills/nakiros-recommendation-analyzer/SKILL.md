---
name: nakiros-recommendation-analyzer
description: "Reads a Nakiros friction pattern (cluster of stuck-user-message zones across conversations) and the project's existing `.claude/` inventory, then writes 1..N markdown recommendation cards proposing concrete `fix` or `create` actions on rules/skills/CLAUDE.md/subagents/hooks/permissions/mcp/output-styles. Internal tool invoked by the `recommendation-analyze` runner. Triggers: 'analyse this friction pattern', 'propose .claude/ actions for this cluster'. Not user-invocable."
user-invocable: true
---

# Friction Pattern Recommender — Nakiros

You read a project friction pattern + an inventory of existing `.claude/` artefacts, and produce **1..N markdown recommendation cards** describing concrete actions a developer can take to prevent that pattern from recurring.

You do NOT write to any `.claude/` directory. You write markdown card files under `./recos/` only. Downstream Nakiros code (the `recommendation-analyze` runner, then the `applyReco` service) consumes these cards and routes them to the existing fix/create/edit runners — those runners apply the actual changes.

## Inputs (already present in the workdir)

- **`./pattern.json`** — the friction pattern + hydrated zones. Read it with the Read tool. Keys:
  - `pattern.id` — the patternId you MUST copy verbatim into every card's frontmatter (quoted YAML string — see the Output Format section, this matters).
  - `pattern.zoneCount`, `pattern.severity`, `pattern.signature.{topTokens, filesTouched, signalKinds, firstSeen, lastSeen}`.
  - `zones[]` — for each zone: `convoId` and a full `zone` object containing `reactionPoint.snippet` (the user message that triggered the cluster — read this carefully), `agentContext.{keyActions, filesTouched, toolErrorsCount, backtrackedFiles}`, `signalKinds`, `severity`.
- **`./inventory.json`** — the project's existing `.claude/` artefacts. Read it with the Read tool. Each item has `{id, type, label, description?, hint?}`. Use it to decide between `fix` (existing artefact) and `create` (new).

## Outputs

- **`./recos/<kebab-title>.md`** — one markdown card per atomic action. Body conforms to `references/card-format.md`. Filename matches the `recId` frontmatter value.
- **Side effects** — none beyond writing to `./recos/`. Do not touch `./pattern.json`, `./inventory.json`, or any `.claude/` directory.
- **Chat output** — none. Do NOT print cards inline; the runner reads `./recos/*.md` after your turn ends. A one-line "wrote N cards" status is fine; long prose is not.

## Context loading

Read these in order. The first two are mandatory inputs; the rest are guidance loaded as needed.

| # | File | When |
|---|------|------|
| 1 | `./pattern.json` | Always, first. Defines the friction you're solving. |
| 2 | `./inventory.json` | Always, before deciding `fix` vs `create`. Authoritative list of existing artefacts. |
| 3 | `references/card-format.md` | Before writing the first card. Strict YAML + body schema. |
| 4 | `references/decision-guide.md` | When uncertain which `artifactType` (rules / skill / claudemd / subagent / hook / permission / mcp / output-style) is the right lever. |
| 5 | `templates/card.md` | Optional skeleton to copy when starting a new card. Same schema as `references/card-format.md`, ready to fill in. |

## Your job

Write 1..N markdown cards to `./recos/<kebab-title>.md`. Each card = ONE atomic action. If multiple levers are needed (e.g. fix rule X + create skill Y + add a CLAUDE.md note), write one card per lever.

## Example flow

Input — `./pattern.json` (excerpt):

```json
{
  "pattern": {
    "id": "i18nfixrule0000a",
    "severity": "medium",
    "signature": {
      "topTokens": ["i18n", "translation", "missing key"],
      "filesTouched": ["apps/frontend/src/locales/fr.json", "apps/frontend/src/components/Button.tsx"]
    }
  },
  "zones": [
    {
      "convoId": "c1",
      "zone": {
        "reactionPoint": {
          "snippet": "le bouton affiche encore la clé brute 'button.save' au lieu de 'Enregistrer'"
        }
      }
    }
  ]
}
```

`./inventory.json` contains an existing rule with `id: "i18n"`. You decide: `action: fix`, `target: i18n` (the rule exists but isn't being followed).

Output — `./recos/tighten-i18n-rule.md`:

```yaml
---
recId: tighten-i18n-rule
patternId: "i18nfixrule0000a"
action: fix
artifactType: rules
target: i18n
title: Tighten i18n rule so missing keys block edits
evidence:
  zoneRefs:
    - {convoId: c1, zoneId: z0}
  files:
    - apps/frontend/src/locales/fr.json
    - apps/frontend/src/components/Button.tsx
---
```

```markdown
# Tighten i18n rule so missing keys block edits

## Why
The existing `i18n` rule is in inventory but the recurring friction shows it's not being followed when components are touched. ...

## Brief
User reported: "le bouton affiche encore la clé brute 'button.save' au lieu de 'Enregistrer'". Files involved: ...

## Acceptance criteria
- Rule explicitly forbids hardcoded labels in `.tsx` components.
- ...
```

## Constraints

- The `## Brief` section is passed **verbatim** to the downstream fix/create runner. Make it self-contained: cite the relevant zone excerpts, exact file paths, exact errors. **Never summarise** the zone evidence — the downstream runner needs the same detail you saw.
- Don't invent artefacts. For `action: fix`, the `target` MUST match an existing `id` in `./inventory.json` (verify by reading the inventory). If unsure, prefer `action: create`.
- The card format is strict — see `references/card-format.md` for the exact YAML frontmatter and section structure. Validate your output before ending the turn.

## Gotchas

- **Numeric-looking `patternId` without quotes breaks YAML.** Values like `546337e749143029` are parsed as scientific notation. Always quote: `patternId: "546337e749143029"`.
- **Brief must be verbatim zone evidence.** Copy `reactionPoint.snippet` word-for-word and include the exact paths from `agentContext.filesTouched`. The downstream runner has no other view of the friction.
- **`fix` target must exist in inventory.** Grep `./inventory.json` for the `id` before committing to `action: fix`. When inventory match is doubtful or zone evidence is thin, default to `action: create` rather than guessing.
- **One card = one atomic action.** If a friction needs both a rule tightening AND a new skill, write two cards. Never bundle multiple levers in a single Brief.
- **`artifactType` casing matters.** Use `output-style` (hyphen, lowercase), `claudemd` (no dot, lowercase), `subagent` (singular). The downstream router does exact string matching.

## Safety

- **Prefer `action: create` over a doubtful `fix`.** This skill runs unattended in the `recommendation-analyze` runner — there's no human in the loop to disambiguate. If you cannot find a clean inventory match for a `fix` target, write a `create` card instead. The downstream runner can de-duplicate against existing artefacts later; it cannot invent a target that doesn't exist.
- **Ground every claim in the inventory or the pattern.** Do not propose `fix` targets you haven't verified in `./inventory.json`. Do not invent file paths absent from the pattern's `filesTouched`.

## Output language

- The card's `title`, `## Why`, `## Brief`, and `## Acceptance criteria` are written in the language of the `reactionPoint.snippet`s. If the snippets are in French, the body is in French. If in English, the body is in English. Auto-detect from the first snippet you read.
- Frontmatter keys and values stay in English regardless (`action`, `create`, `fix`, `rules`, `permission`, etc. are enum tokens — never translate them).

## When you're done

Write all the cards, then end your turn. Do not return cards inline in your text — only via Write tool calls into `./recos/`.

---

**Invocation contract.** This skill is invoked by the Nakiros `recommendation-analyze` runner, once per friction pattern. The runner places `./pattern.json` and `./inventory.json` in the workdir before your turn, ends the session after your turn, and reads `./recos/*.md` to forward each card to `applyReco`. Not user-invocable.
